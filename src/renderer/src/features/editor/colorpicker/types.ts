// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipos del color picker — el puente con el motor.
 *
 * El motor (Innerta) publica los literales de color del buffer con su rect
 * en pantalla; el frontend los dibuja (el cuadradito al lado del hex) y
 * maneja el panel. El motor conserva el parseo, el formato y la escritura en
 * el buffer: acá no se reimplementa nada de eso.
 */

/**
 * Evento con el que el motor publica los literales de color de la sesión
 * activa. Vive acá (sin imports) para que el motor y el panel no se
 * importen mutuamente.
 */
export const COLOR_TOKENS_EVENT = 'app-color-tokens'

/** Formato del literal — espejo de `ColorFormat` del motor. */
export const COLOR_FORMAT = {
  Hex3: 0,
  Hex4: 1,
  Hex6: 2,
  Hex8: 3,
  Rgb: 4,
  Rgba: 5,
  Hsl: 6,
  Hsla: 7
} as const

export interface ColorTokenInfo {
  /** Línea (0-based). */
  line: number
  /** Columna inicial (inclusive). */
  colStart: number
  /** Columna final (exclusive). */
  colEnd: number
  /** Rect en pantalla, relativo al canvas. */
  x: number
  y: number
  w: number
  h: number
  /** Color en sRGB 0..1. */
  r: number
  g: number
  b: number
  a: number
  /** Formato del literal (ver COLOR_FORMAT). */
  format: number
  /** El texto original (`#ff0000`, `rgb(1,2,3)`…). */
  raw: string
}

/** Color en sRGB 0..1 (como el motor). */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** Color en HSV: `h` 0..360, `s`/`v`/`a` 0..1. */
export interface Hsva {
  h: number
  s: number
  v: number
  a: number
}

/**
 * Medidas del panel — las MISMAS que el motor tenía en `LayoutSpec`
 * (kPanelPad 10, kSvSize 180, kGap 10, kHueBarW 16, kAlphaBarH 14,
 * kPreviewH 28, kHexFieldH 26, kBtnH 28, kBtnRadius 8, kPanelRadius 10).
 * El panel del frontend tiene que verse igual que el nativo.
 */
export const PICKER = {
  panelRadius: 10,
  panelPad: 10,
  svSize: 180,
  gap: 10,
  hueBarW: 16,
  alphaBarH: 14,
  previewH: 28,
  previewW: 48,
  hexFieldH: 26,
  btnH: 28,
  btnRadius: 8,
  /** Ancho interior (sv + gap + hue). */
  innerW: 180 + 10 + 16
} as const

/** Ancho total del panel. */
export const PICKER_W = PICKER.innerW + PICKER.panelPad * 2

/** Alto total del panel. */
export const PICKER_H =
  PICKER.panelPad +
  PICKER.svSize +
  PICKER.gap +
  PICKER.alphaBarH +
  PICKER.gap +
  PICKER.previewH +
  PICKER.gap +
  PICKER.hexFieldH +
  PICKER.gap +
  PICKER.btnH +
  PICKER.panelPad

/** Convierte el JSON del motor en tokens (con tolerate a fallos: si no, lista vacía). */
export function parseColorTokens(json: string): ColorTokenInfo[] {
  if (!json) return []
  try {
    const raw = JSON.parse(json) as unknown
    if (!Array.isArray(raw)) return []
    return raw as ColorTokenInfo[]
  } catch {
    return []
  }
}
