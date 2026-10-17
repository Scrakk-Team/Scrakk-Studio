// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * MIRA y MIDE un audio: envolvente en ASCII + ataques (onsets) en ms.
 *
 * Existe por lo mismo que `_look-path.mjs`: un archivo de sonido hay que
 * MIRARLO. Sin oído, la única forma de acertarle al instante exacto de un trueno
 * (para sincronizar el rayo) es medir: acá se decodifica a PCM, se calcula la
 * energía por ventana y se marcan los SALTOS (el ataque), además del brillo
 * espectral (ZCR) para distinguir lluvia (agudo, sostenido) de trueno (grave,
 * con ataque).
 *
 *   node tools/_look-audio.mjs archivo.ogg [--cols 72] [--hop 10] [--top 6]
 *
 * Salida:
 *   - un gráfico de la envolvente (una columna por ventana),
 *   - la tabla de ataques: tiempo, fuerza (x la mediana local) y brillo,
 *   - la duración total.
 */

import { spawnSync } from 'node:child_process'

const file = process.argv[2]
if (!file) {
  console.log('uso: node tools/_look-audio.mjs archivo.ogg [--cols 72] [--hop 10] [--top 6]')
  process.exit(1)
}

function flag(name, fallback) {
  const withEq = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (withEq) return withEq.slice(name.length + 3)
  const idx = process.argv.indexOf(`--${name}`)
  return idx !== -1 ? process.argv[idx + 1] : fallback
}

const SR = 8000
const HOP_MS = Number(flag('hop', '10'))
const TOP = Number(flag('top', '6'))

const pcm = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'],
  { maxBuffer: 1 << 30 }
)
if (pcm.status !== 0 || !pcm.stdout?.length) {
  console.error('no pude decodificar el audio (¿ffmpeg?)')
  process.exit(1)
}

const buf = pcm.stdout
const total = Math.floor(buf.length / 4)
const hop = Math.max(1, Math.round((HOP_MS / 1000) * SR))
const frames = []

for (let start = 0; start + hop <= total; start += hop) {
  let sum = 0
  let crossings = 0
  let prev = 0
  for (let i = start; i < start + hop; i += 1) {
    const v = buf.readFloatLE(i * 4)
    sum += v * v
    if (i > start && ((v >= 0) !== (prev >= 0))) crossings += 1
    prev = v
  }
  frames.push({
    t: (start / SR) * 1000,
    rms: Math.sqrt(sum / hop),
    zcr: crossings / hop
  })
}

const peak = Math.max(...frames.map((f) => f.rms), 1e-9)

// ── Ataques: subida fuerte contra la mediana LOCAL (no contra el pico global) ──
const onsets = []
for (let i = 6; i < frames.length; i += 1) {
  const window = frames.slice(Math.max(0, i - 20), i).map((f) => f.rms).sort((a, b) => a - b)
  const median = window[Math.floor(window.length / 2)] || 1e-9
  const ratio = frames[i].rms / median
  const loud = frames[i].rms > peak * 0.08
  if (ratio >= 2.5 && loud) {
    // No repetir el mismo ataque (nos quedamos con el primero de la ráfaga).
    const last = onsets[onsets.length - 1]
    if (last && frames[i].t - last.t < 120) continue
    onsets.push({ t: frames[i].t, ratio, zcr: frames[i].zcr, rms: frames[i].rms })
  }
}

// ── Gráfico ────────────────────────────────────────────────────────────────
const cols = Number(flag('cols', '72'))
const rows = 10
const perCol = Math.max(1, Math.ceil(frames.length / cols))
const lines = []
for (let r = 0; r < rows; r += 1) {
  let line = ''
  for (let c = 0; c < cols; c += 1) {
    const slice = frames.slice(c * perCol, (c + 1) * perCol)
    if (slice.length === 0) {
      line += ' '
      continue
    }
    const level = Math.max(...slice.map((f) => f.rms)) / peak
    line += level * rows > rows - 1 - r ? '#' : ' '
  }
  lines.push(line)
}

console.log(`# ${file} — ${(total / SR).toFixed(2)}s · ${frames.length} ventanas de ${HOP_MS}ms`)
console.log(lines.join('\n'))
const dur = total / SR
const marks = Array.from({ length: cols }, () => ' ')
for (const o of onsets) {
  const at = Math.min(cols - 1, Math.floor((o.t / 1000) * (cols / dur)))
  marks[at] = '^'
}
console.log(marks.join(''))
console.log('t=0' + ' '.repeat(Math.max(0, cols - 12)) + `${dur.toFixed(1)}s`)

const top = [...onsets].sort((a, b) => b.ratio - a.ratio).slice(0, TOP).sort((a, b) => a.t - b.t)
console.log(`\nataques (${onsets.length}):`)
for (const o of top) {
  const kind = o.zcr > 0.25 ? 'agudo (lluvia/ruido)' : 'grave (trueno)'
  console.log(
    `  ${o.t.toFixed(0).padStart(6)} ms  ·  x${o.ratio.toFixed(1)}  ·  zcr ${(o.zcr * 100).toFixed(0)}%  ·  ${kind}`
  )
}
