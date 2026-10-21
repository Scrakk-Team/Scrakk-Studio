// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Matemática de color del picker (la misma que hacía el motor).
 *
 * El motor conserva el parseo del literal y el formato con que se escribe
 * de vuelta al buffer: esto es sólo la matemática que necesita el panel para
 * mover el SV square / la barra de tono / la de alfa.
 */

import type { Hsva, Rgba } from './types'

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

export function rgbaToHsva(c: Rgba): Hsva {
  const maxv = Math.max(c.r, c.g, c.b)
  const minv = Math.min(c.r, c.g, c.b)
  const d = maxv - minv
  let h = 0
  if (d > 1e-6) {
    if (maxv === c.r) h = 60 * (((c.g - c.b) / d + 6) % 6)
    else if (maxv === c.g) h = 60 * ((c.b - c.r) / d + 2)
    else h = 60 * ((c.r - c.g) / d + 4)
  }
  if (h < 0) h += 360
  return {
    h,
    s: maxv <= 1e-6 ? 0 : d / maxv,
    v: maxv,
    a: c.a
  }
}

export function hsvaToRgba(c: Hsva): Rgba {
  const h = ((c.h % 360) + 360) % 360
  const s = clamp01(c.s)
  const v = clamp01(c.v)
  const c2 = v * s
  const x = c2 * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) { r = c2; g = x }
  else if (h < 120) { r = x; g = c2 }
  else if (h < 180) { g = c2; b = x }
  else if (h < 240) { g = x; b = c2 }
  else if (h < 300) { r = x; b = c2 }
  else { r = c2; g = x }
  return { r: r + m, g: g + m, b: b + m, a: clamp01(c.a) }
}

/** `#rrggbb` (sin alfa) — es lo que muestra el campo de texto. */
export function rgbaToHex(c: Rgba): string {
  const to255 = (v: number): string =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to255(c.r)}${to255(c.g)}${to255(c.b)}`
}

/** `rgba(r, g, b, a)` para CSS. */
export function rgbaToCss(c: Rgba): string {
  const to255 = (v: number): number => Math.round(clamp01(v) * 255)
  const alpha = Math.round(clamp01(c.a) * 100) / 100
  return `rgba(${to255(c.r)}, ${to255(c.g)}, ${to255(c.b)}, ${alpha})`
}

/** Parsea `#rgb`, `#rgba`, `#rrggbb` o `#rrggbbaa`. Devuelve null si no es hex. */
export function parseHex(text: string): Rgba | null {
  const value = text.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]+$/.test(value)) return null
  const expand = (s: string): number => parseInt(s, 16)
  if (value.length === 3 || value.length === 4) {
    const r = expand(value[0] + value[0]) / 255
    const g = expand(value[1] + value[1]) / 255
    const b = expand(value[2] + value[2]) / 255
    const a = value.length === 4 ? expand(value[3] + value[3]) / 255 : 1
    return { r, g, b, a }
  }
  if (value.length === 6 || value.length === 8) {
    const r = expand(value.slice(0, 2)) / 255
    const g = expand(value.slice(2, 4)) / 255
    const b = expand(value.slice(4, 6)) / 255
    const a = value.length === 8 ? expand(value.slice(6, 8)) / 255 : 1
    return { r, g, b, a }
  }
  return null
}
