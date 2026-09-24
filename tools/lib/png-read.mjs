// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Lector de PNG mínimo (8 bits, sin entrelazar) para los tools que necesitan
 * MIRAR una captura: `_look-png.mjs` (dibuja la imagen en texto) y los probes
 * (comparan dos capturas A/B).
 *
 * Se decodifica a mano (zlib + unfilter) en vez de sumar una dependencia de
 * imágenes: el PNG que produce Electron es siempre el mismo caso simple, y una
 * dependencia nativa en el repo no se justifica por esto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SIEMPRE SALE RGBA (4 canales), AUNQUE EL PNG VENGA RGB
 *
 * `capturePage()` de Electron puede producir PNG SIN alfa (colorType 2 = 3
 * canales). Esto se normaliza acá y no en cada consumidor, porque un buffer de
 * 3 canales leído con paso 4 no falla ruidosamente: lee bytes CORRIDOS y los
 * conteos de color salen mal en silencio. Ya pasó — el mapa de color mostraba
 * "patrones" de 3 píxeles que eran el artefacto del desfasaje, y una medición
 * de "cuánto color pinta el editor" quedó sin valor sin que nada avisara.
 */

import { inflateSync } from 'node:zlib'

/** PNG → { width, height, data (RGBA), channels }. */
export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('no es un PNG')
  let offset = 8
  let width = 0
  let height = 0
  let channels = 4
  const idat = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const bitDepth = data[8]
      const colorType = data[9]
      channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0
      if (bitDepth !== 8 || data[12] !== 0 || channels === 0) {
        throw new Error(`PNG no soportado (bitDepth=${bitDepth}, colorType=${colorType})`)
      }
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const row = raw.subarray(pos, pos + stride)
    pos += stride
    const prev = y === 0 ? null : out.subarray((y - 1) * stride, y * stride)
    const target = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? target[x - channels] : 0
      const up = prev ? prev[x] : 0
      const upLeft = prev && x >= channels ? prev[x - channels] : 0
      let value = row[x]
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
      target[x] = value & 0xff
    }
  }
  if (channels === 4) return { width, height, data: out, channels: 4 }

  // Expansión a RGBA: mismo píxel (r,g,b) + alfa opaco, para que todo consumidor
  // pueda asumir 4 canales sin preguntar.
  const rgba = Buffer.alloc(width * height * 4)
  for (let pixel = 0; pixel < width * height; pixel++) {
    const from = pixel * channels
    const to = pixel * 4
    if (channels === 3) {
      rgba[to] = out[from]
      rgba[to + 1] = out[from + 1]
      rgba[to + 2] = out[from + 2]
    } else {
      // 1 canal (gris): los tres componentes valen lo mismo.
      rgba[to] = out[from]
      rgba[to + 1] = out[from]
      rgba[to + 2] = out[from]
    }
    rgba[to + 3] = 255
  }
  return { width, height, data: rgba, channels: 4 }
}

/** ¿El color es "de token"? Claro y con matiz (el texto sin color es gris). */
export function isVivid(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max >= 120 && max - min >= 45
}

/** ¿El color es neutro (gris/blanco/negro)? */
export function isNeutral(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max - min < 25
}

/**
 * Compara dos capturas del MISMO rectángulo y cuenta los píxeles que pasaron de
 * NEUTROS a VÍVIDOS: eso es exactamente "el editor empezó a pintar tokens".
 *
 * Medir densidad de color en una sola imagen no sirve acá: el canvas del editor
 * es semitransparente y el wallpaper de fondo tiene color. La comparación A/B es
 * la que no se puede falsear.
 */
export function diffNeutralToVivid(before, after) {
  const width = Math.min(before.width, after.width)
  const height = Math.min(before.height, after.height)
  let vivid = 0
  let strong = 0
  const samples = []
  for (let i = 0; i < width * height * 4; i += 4) {
    const b = [before.data[i], before.data[i + 1], before.data[i + 2]]
    const a = [after.data[i], after.data[i + 1], after.data[i + 2]]
    const delta = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
    if (delta > 150) strong++
    if (isNeutral(b[0], b[1], b[2]) && isVivid(a[0], a[1], a[2])) {
      vivid++
      if (samples.length < 6) samples.push(`${b.join(',')} → ${a.join(',')}`)
    }
  }
  return { width, height, vivid, strong, samples }
}

/**
 * Cambios FUERTES entre dos capturas del mismo rectángulo, sin suponer colores.
 *
 * `diffNeutralToVivid` responde "el editor empezó a pintar color": sirve para
 * el tokenizado. Este responde "esta zona CAMBIó", que es lo que hay que medir
 * cuando el cambio no es gris → color: una SELECCIÓN no vuelve vívido nada
 * (oscurece un fondo que ya tenía color) y un PLEGADO hace DESAPARECER texto.
 *
 * `region` recorta a una parte de la imagen (p. ej. la columna del gutter, para
 * separar "cambió el chevron" de "cambió el texto").
 *
 * `umbral` es la suma de diferencias RGB a partir de la cual un píxel "cambió".
 * Es bajo a propósito: dos capturas del MISMO estado de la app son idénticas
 * píxel a píxel (el canvas es determinista), así que la decisión de "esto es un
 * cambio de verdad" no se toma acá sino en el CONTEO que pide el llamador. Un
 * umbral alto escondería cambios reales que mueven poco el color — el fondo de
 * una SELECCIÓN, por ejemplo. El único ruido conocido es el caret parpadeando
 * (~40 px), y por eso los chequeos piden cientos de píxeles, no decenas.
 */
export function diffStrong(before, after, region, umbral = 60) {
  const width = Math.min(before.width, after.width)
  const height = Math.min(before.height, after.height)
  const x0 = Math.max(0, Math.floor(region?.x ?? 0))
  const y0 = Math.max(0, Math.floor(region?.y ?? 0))
  const x1 = Math.min(width, x0 + Math.floor(region?.width ?? width))
  const y1 = Math.min(height, y0 + Math.floor(region?.height ?? height))
  let changed = 0
  const samples = []
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4
      const delta =
        Math.abs(after.data[i] - before.data[i]) +
        Math.abs(after.data[i + 1] - before.data[i + 1]) +
        Math.abs(after.data[i + 2] - before.data[i + 2])
      if (delta > umbral) {
        changed++
        if (samples.length < 5) {
          samples.push(
            `${before.data[i]},${before.data[i + 1]},${before.data[i + 2]} → ` +
              `${after.data[i]},${after.data[i + 1]},${after.data[i + 2]}`
          )
        }
      }
    }
  }
  return { width: x1 - x0, height: y1 - y0, changed, samples }
}
