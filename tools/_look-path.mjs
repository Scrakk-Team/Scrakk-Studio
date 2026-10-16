// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * MIRA un path SVG: lo imprime como ASCII relleno.
 *
 * Existe por el mismo motivo que `_look-png.mjs`: una forma hay que MIRARLA. Un
 * path de un pack de eventos no se puede juzgar leyendo los números ("parece un
 * murciélago" vs "parece una mariposa" es una diferencia de 2 curvas), y abrir
 * la app para cada intento es un ciclo lentísimo.
 *
 *   node tools/_look-path.mjs --path "M0 0 L10 0 L10 5 Z" --viewbox 10,5
 *   node tools/_look-path.mjs --viewbox 32,16 --path "…" --path "…"   (varios)
 *   … [--cols 72] [--sx 0.7]     (`--sx` simula el ala plegada del aleteo)
 *
 * Soporta M/m L/l C/c Q/q Z/z (absoluto y relativo). Rellena con la regla
 * EVEN-ODD, que para un contorno simple (una sola pasada) es idéntico al
 * non-zero que usa `Path2D`. No dibuja trazos: es para juzgar el SILUETEO.
 */

/** Tokeniza: comandos y números (con signo, decimales y exponente). */
function tokenize(d) {
  const tokens = []
  const re = /([MLCQZmlcqz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi
  let m
  while ((m = re.exec(d)) !== null) {
    if (m[1]) tokens.push({ cmd: m[1] })
    else tokens.push({ num: Number(m[2]) })
  }
  return tokens
}

/** Cuántas muestras por curva. Suficiente para ASCII. */
const CURVE_STEPS = 14

function quad(p0, c, p1, out) {
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS
    const u = 1 - t
    out.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y })
  }
}

function cubic(p0, c1, c2, p1, out) {
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS
    const u = 1 - t
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
      y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y
    })
  }
}

/** Path → subpaths (listas de puntos ya aplanadas). */
function parsePath(d) {
  const tokens = tokenize(d)
  const subpaths = []
  let current = []
  let cursor = { x: 0, y: 0 }
  let start = { x: 0, y: 0 }
  let cmd = null
  let i = 0

  const readPoint = (relative) => {
    const x = tokens[i++].num
    const y = tokens[i++].num
    return relative ? { x: cursor.x + x, y: cursor.y + y } : { x, y }
  }
  const hasNumbers = (n) => {
    for (let k = 0; k < n; k++) if (!tokens[i + k] || tokens[i + k].num === undefined) return false
    return true
  }

  while (i < tokens.length) {
    if (tokens[i].cmd) {
      cmd = tokens[i].cmd
      i++
    } else if (cmd === 'M') {
      cmd = 'L' // puntos implícitos después de M son líneas
    } else if (cmd === 'm') {
      cmd = 'l'
    }
    const relative = cmd === cmd.toLowerCase()
    const upper = cmd.toUpperCase()

    if (upper === 'Z') {
      if (current.length > 0) {
        current.push({ ...start })
        subpaths.push(current)
        current = []
      }
      cursor = { ...start }
      cmd = null
      continue
    }

    if (upper === 'M') {
      if (current.length > 1) subpaths.push(current)
      const p = readPoint(relative)
      cursor = p
      start = { ...p }
      current = [{ ...p }]
      continue
    }

    if (upper === 'L') {
      const p = readPoint(relative)
      cursor = p
      current.push({ ...p })
      continue
    }

    if (upper === 'Q') {
      const c = readPoint(relative)
      const p = readPoint(relative)
      quad(cursor, c, p, current)
      cursor = p
      continue
    }

    if (upper === 'C') {
      const c1 = readPoint(relative)
      const c2 = readPoint(relative)
      const p = readPoint(relative)
      cubic(cursor, c1, c2, p, current)
      cursor = p
      continue
    }

    // Un número suelto con el comando consumido: se ignora para no colgarse.
    if (!hasNumbers(2)) break
    i++
  }
  if (current.length > 1) subpaths.push(current)
  return subpaths
}

/** ¿El punto cae adentro? Even-odd sobre todas las aristas. */
function filled(subpaths, px, py) {
  let crossings = 0
  for (const points of subpaths) {
    for (let i = 0; i < points.length; i++) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      if (a.y > py !== b.y > py) {
        const x = a.x + ((py - a.y) / (b.y - a.y)) * (b.x - a.x)
        if (px < x) crossings++
      }
    }
  }
  return crossings % 2 === 1
}

function render(label, d, viewBox, cols) {
  const subpaths = parsePath(d)
  if (subpaths.length === 0) {
    console.log(`# ${label}: sin subpaths`)
    return
  }
  const [vx, vy, vw, vh] = viewBox
  // Las celdas de la terminal son ~2:1 (alto:ancho): se compensa para que la
  // forma no salga estirada.
  const rows = Math.max(1, Math.round(cols * (vh / vw) / 2.1))
  const cx = vx + vw / 2
  const lines = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let c = 0; c < cols; c++) {
      // `--sx` simula un fotograma del aleteo: el motor pliega el ala bajando el
      // ancho ALREDEDOR del centro, igual que acá.
      const x = cx + (vx + ((c + 0.5) / cols) * vw - cx) / sx
      const y = vy + ((r + 0.5) / rows) * vh
      line += filled(subpaths, x, y) ? '#' : '·'
    }
    lines.push(line)
  }
  // Recorte a lo dibujado: evita el aire del viewBox y centra la lectura.
  const minX = Math.min(...subpaths.flat().map((p) => p.x))
  const maxX = Math.max(...subpaths.flat().map((p) => p.x))
  const minY = Math.min(...subpaths.flat().map((p) => p.y))
  const maxY = Math.max(...subpaths.flat().map((p) => p.y))
  console.log(`# ${label} — bbox x:${minX.toFixed(1)}..${maxX.toFixed(1)} y:${minY.toFixed(1)}..${maxY.toFixed(1)}`)
  console.log(lines.join('\n'))
}

const paths = []
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--path') paths.push(process.argv[++i])
  else if (process.argv[i].startsWith('--path=')) paths.push(process.argv[i].slice(7))
}
const vbArg = process.argv.find((a) => a.startsWith('--viewbox=')) ?? process.argv[process.argv.indexOf('--viewbox') + 1]
// Acepta `w,h` (como el `viewBox` de una shape: origen 0,0) o `x,y,w,h`.
const vbParts = (vbArg ?? '32,16').split(',').map(Number)
const viewBox = vbParts.length === 4 ? vbParts : [0, 0, vbParts[0], vbParts[1]]
const colsArg = process.argv.find((a) => a.startsWith('--cols=')) ?? process.argv[process.argv.indexOf('--cols') + 1]
const cols = Number((colsArg ?? '72').toString().replace('--cols=', '')) || 72
// Simula un fotograma del aleteo: el motor pliega el ala bajando el ANCHO.
const sxArg = process.argv.find((a) => a.startsWith('--sx=')) ?? (process.argv.includes('--sx') ? process.argv[process.argv.indexOf('--sx') + 1] : undefined)
const sx = Number((sxArg ?? '1').toString().replace('--sx=', '')) || 1

if (paths.length === 0) {
  console.log('uso: node tools/_look-path.mjs --viewbox 32,16 --path "M0 0 …" [--path "…"] [--cols 72]')
  process.exit(1)
}
paths.forEach((p, i) => render(`path ${i + 1}`, p, viewBox, cols))
