// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Posición del caret en coords del canvas — SIN tocar el motor.
 *
 * El motor tiene el caret en coords de TEXTO (`getCursor()` → línea/columna) y
 * `hitTest(x, y)` va de PANTALLA → texto. La inversa no existe, así que se
 * calcula con dos búsquedas binarias sobre `hitTest`, que es puro frontend:
 *
 *   1. la Y de la línea del caret (primera Y cuya línea es la del caret);
 *   2. la X del caret dentro de esa línea (primera X cuya columna ya llegó).
 *
 * Son ~24 llamadas baratas por actualización, sin eventos nuevos ni rebuild.
 * Si la línea del caret no está visible, devuelve `null` y el popup no se
 * abre (mejor eso que anclarlo en el lugar equivocado).
 */

import type { InnertaModule } from '@features/editor/engines/innerta/InnertaEngine'
import type { CaretRect } from './state'

/** Línea del hit-test en (x,y); -1 si el punto cae fuera del texto. */
function lineAt(hit: NonNullable<InnertaModule['hitTest']>, x: number, y: number): number {
  const hitTest = hit(x, y)
  return hitTest && hitTest.line >= 0 ? hitTest.line : -1
}

/** Columna del hit-test en (x,y); -1 si cae fuera. */
function colAt(hit: NonNullable<InnertaModule['hitTest']>, x: number, y: number): number {
  const hitTest = hit(x, y)
  return hitTest && hitTest.line >= 0 ? hitTest.col : -1
}

/**
 * Rect del caret (px locales del canvas) o `null` si no se puede calcular
 * (sin módulo, sin caret, línea fuera de la vista, canvas sin tamaño).
 */
export function caretCanvasRect(
  module: InnertaModule | null,
  canvas: HTMLCanvasElement | null
): CaretRect | null {
  const hit = module?.hitTest
  const cursor = module?.getCursor?.()
  if (!module || !hit || !cursor || cursor.line < 0) return null

  const width = canvas?.clientWidth ?? 0
  const height = canvas?.clientHeight ?? 0
  if (width <= 0 || height <= 0) return null

  const textX = Math.max(0, Math.floor(module.getTextXOffset?.() ?? 0))
  const lineHeight = Math.max(1, Math.floor(module.getLineHeight?.() ?? 16))

  // ── 1. Y: primera Y cuya línea es la del caret ───────────────────────────
  let lo = 0
  let hi = height - 1
  let top = -1
  let guard = 0
  while (lo <= hi && guard++ < 40) {
    const mid = (lo + hi) >> 1
    const line = lineAt(hit, textX + 1, mid)
    // -1 (debajo del texto) se trata como "más abajo que la línea buscada".
    const cmp = line < 0 ? Number.MAX_SAFE_INTEGER : line
    if (cmp === cursor.line) {
      top = mid
      hi = mid - 1
    } else if (cmp < cursor.line) {
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (top < 0) return null

  // ── 2. X: primera X cuya columna ya es la del caret ──────────────────────
  const yMid = top + lineHeight / 2
  let xLo = textX
  let xHi = width - 1
  let left = -1
  guard = 0
  while (xLo <= xHi && guard++ < 40) {
    const mid = (xLo + xHi) >> 1
    const col = colAt(hit, mid, yMid)
    if (col >= cursor.col) {
      left = mid
      xHi = mid - 1
    } else {
      xLo = mid + 1
    }
  }
  // Caret al final de la línea: ninguna columna "llega" (el hit-test clampa a
  // la última). Se usa el extremo visual de la línea.
  if (left < 0) {
    left = Math.min(width - 1, textX + Math.max(0, cursor.col) * 1)
  }

  return { x: left, y: top, height: lineHeight }
}
