/**
 * MIRA un PNG (o compara dos): lo imprime como mapa de color en texto.
 *
 * Existe porque las capturas del editor hay que MIRARLAS, no sólo contarlas: un
 * conteo de "píxeles con tinte" dio un falso positivo (contaba el degradado de
 * fondo). Esto dibuja la imagen en la terminal, una letra por clase de color, y
 * en modo diff marca dónde CAMBIAN dos capturas.
 *
 *   node tools/_look-png.mjs <archivo.png> [columnas] [--bright]
 *   node tools/_look-png.mjs <antes.png> <despues.png> [columnas]
 *
 * Letras: . fondo · g gris (texto sin color) · R rojo · Y amarillo/naranja ·
 *         G verde · C cyan · B azul · M magenta · W blanco
 */

import { readFileSync } from 'node:fs'
import { decodePng } from './lib/png-read.mjs'

const ONLY_BRIGHT = process.argv.includes('--bright')

/** Clase de color de un píxel: una letra. */
function classify(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (ONLY_BRIGHT && (max < 140 || max - min < 40)) return '.'
  if (max < 28) return '.'
  const chroma = max - min
  if (chroma < 22) return max > 150 ? 'W' : 'g'
  let hue
  if (max === r) hue = ((g - b) / chroma + 6) % 6
  else if (max === g) hue = (b - r) / chroma + 2
  else hue = (r - g) / chroma + 4
  const deg = Number.isFinite(hue) ? hue * 60 : NaN
  if (Number.isNaN(deg)) return '?'
  if (deg < 20 || deg >= 330) return 'R'
  if (deg < 70) return 'Y'
  if (deg < 160) return 'G'
  if (deg < 250) return 'C'
  return 'M'
}

const file = process.argv[2]
const second = process.argv[3]?.endsWith('.png') ? process.argv[3] : null
const columns = Number((second ? process.argv[4] : process.argv[3]) ?? 110) || 110
let image = decodePng(readFileSync(file))

/**
 * `--crop=x,y,w,h`: zoom a una zona (p. ej. UNA línea de texto). A tamaño
 * completo las celdas mezclan glifos con el fondo y no se leen las letras; con
 * el recorte al texto, cada glifo se ve como una mancha de su color.
 */
const cropArg = process.argv.find((arg) => arg.startsWith('--crop='))
if (cropArg) {
  const [x, y, w, h] = cropArg.slice('--crop='.length).split(',').map(Number)
  const width = Math.min(w, image.width - x)
  const height = Math.min(h, image.height - y)
  const cropped = Buffer.alloc(width * height * 4)
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * image.width + x) * 4
    image.data.copy(cropped, row * width * 4, from, from + width * 4)
  }
  image = { width, height, data: cropped, channels: image.channels }
}

// ── Modo diff: dos capturas del mismo rect (con y sin la extensión) ────────
if (second) {
  const other = decodePng(readFileSync(second))
  const width = Math.min(image.width, other.width)
  const height = Math.min(image.height, other.height)
  const cellW = Math.max(1, Math.floor(width / columns))
  const cellH = Math.max(2, Math.round(cellW * 2.1))
  const rows = Math.max(1, Math.floor(height / cellH))
  let changed = 0
  let total = 0
  const rowsText = []
  for (let ry = 0; ry < rows; ry++) {
    let line = ''
    for (let rx = 0; rx < columns; rx++) {
      let hits = 0
      let cells = 0
      for (let y = ry * cellH; y < Math.min(height, ry * cellH + cellH); y++) {
        for (let x = rx * cellW; x < Math.min(width, rx * cellW + cellW); x++) {
          const i = (y * width + x) * 4
          total++
          cells++
          const delta =
            Math.abs(image.data[i] - other.data[i]) +
            Math.abs(image.data[i + 1] - other.data[i + 1]) +
            Math.abs(image.data[i + 2] - other.data[i + 2])
          if (delta > 40) hits++
        }
      }
      changed += hits
      line += hits === 0 ? '.' : hits > cells * 0.5 ? '#' : hits > cells * 0.2 ? '+' : '-'
    }
    rowsText.push(line)
  }
  console.log(`# diff ${file} vs ${second} — ${width}×${height} px`)
  console.log(rowsText.join('\n'))
  console.log(`\npíxeles distintos: ${changed}/${total} (${((changed / total) * 100).toFixed(2)}%)`)

  // Qué cambió, exactamente: si el cambio es "gris → color", el editor empezó a
  // pintar tokens; si es "color → color" con pocos px, es antialiasing.
  const pairs = new Map()
  let strong = 0
  for (let i = 0; i < width * height * 4; i += 4) {
    const a = [image.data[i], image.data[i + 1], image.data[i + 2]]
    const b = [other.data[i], other.data[i + 1], other.data[i + 2]]
    const delta = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
    if (delta <= 40) continue
    if (delta > 150) strong++
    const key = `${b.join(',')} → ${a.join(',')}`
    pairs.set(key, (pairs.get(key) ?? 0) + 1)
  }
  console.log(`cambios fuertes (>150): ${strong}`)
  console.log(
    'pares más frecuentes (primero → segundo):',
    JSON.stringify([...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8))
  )
  process.exit(0)
}

// ── Modo mapa ─────────────────────────────────────────────────────────────
const cellW = Math.max(1, Math.floor(image.width / columns))
const cellH = Math.max(2, Math.round(cellW * 2.1))
const rows = Math.max(1, Math.floor(image.height / cellH))
const counts = new Map()
const rowsText = []
for (let ry = 0; ry < rows; ry++) {
  let line = ''
  for (let rx = 0; rx < columns; rx++) {
    const tally = new Map()
    for (let y = ry * cellH; y < Math.min(image.height, ry * cellH + cellH); y++) {
      for (let x = rx * cellW; x < Math.min(image.width, rx * cellW + cellW); x++) {
        const i = (y * image.width + x) * 4
        const cls = classify(image.data[i], image.data[i + 1], image.data[i + 2])
        tally.set(cls, (tally.get(cls) ?? 0) + 1)
        counts.set(cls, (counts.get(cls) ?? 0) + 1)
      }
    }
    // Gana la clase con matiz si hay aunque sea unos pocos px: un punto de texto
    // de color sobre mucho fondo oscuro se perdería con la mayoría simple.
    const vivid = [...tally.entries()].filter(([cls]) => !['.', 'g', 'W'].includes(cls))
    const vividTotal = vivid.reduce((sum, [, n]) => sum + n, 0)
    line +=
      vividTotal >= 2
        ? vivid.sort((a, b) => b[1] - a[1])[0][0]
        : [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  rowsText.push(line)
}

console.log(`# ${file} — ${image.width}×${image.height} px (celda ${cellW}×${cellH})`)
console.log(rowsText.join('\n'))
const total = [...counts.values()].reduce((sum, n) => sum + n, 0)
console.log(
  '\nclases: ' +
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cls, n]) => `${cls}=${((n / total) * 100).toFixed(1)}%`)
      .join(' ')
)
