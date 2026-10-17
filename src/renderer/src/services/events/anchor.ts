// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Elegir DÓNDE cae un efecto (el ANCLA).
 *
 * El rayo baja desde arriba, así que tiene que aterrizar en algo de la parte
 * baja de la pantalla: un botón, un input, un handle de resize. Si cae en el
 * medio del vacío no se lee como "le pegó a algo", se lee como un fondo.
 *
 * Puro y sin DOM a propósito: recibe rectángulos y devuelve un punto, así se
 * puede testear sin navegador.
 */

export interface AnchorRect {
  left: number
  top: number
  width: number
  height: number
}

export interface AnchorPoint {
  x: number
  y: number
}

export interface AnchorOptions {
  /** Cuántos de los más bajos compiten (default 8). */
  candidates?: number
  /** Tamaño mínimo (px) para que un elemento sea blanco válido. Default 8. */
  minSize?: number
}

/**
 * Elige el blanco: entre los `candidates` elementos MÁS BAJOS de la pantalla,
 * el más cercano al centro horizontal (el rayo no cae en una esquina perdida).
 * Si no hay ninguno visible, cae abajo al centro.
 */
export function pickAnchor(
  rects: readonly AnchorRect[],
  viewport: { w: number; h: number },
  options: AnchorOptions = {}
): AnchorPoint {
  const minSize = options.minSize ?? 8
  const take = Math.max(1, options.candidates ?? 8)

  const eligible = rects.filter((r) => {
    if (r.width < minSize || r.height < minSize) return false
    // Tiene que estar (al menos en parte) dentro de la ventana.
    return r.left < viewport.w && r.left + r.width > 0 && r.top < viewport.h && r.top + r.height > 0
  })

  if (eligible.length === 0) {
    return { x: viewport.w / 2, y: viewport.h * 0.82 }
  }

  const withCenter = eligible.map((r) => ({
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    bottom: r.top + r.height
  }))

  // Los más bajos primero.
  withCenter.sort((a, b) => b.bottom - a.bottom)
  const lowest = withCenter.slice(0, take)

  // Entre ellos, el más centrado.
  const centerX = viewport.w / 2
  lowest.sort((a, b) => Math.abs(a.x - centerX) - Math.abs(b.x - centerX))

  return { x: lowest[0].x, y: lowest[0].y }
}

/** Los elementos del DOM que pueden servir de ancla. */
export const ANCHOR_SELECTOR =
  'button:not([disabled]), [role="button"]:not([aria-disabled="true"]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [data-overlay-anchor]'

/** Rectángulos de esos elementos, en coordenadas de pantalla. */
export function collectAnchorRects(root: ParentNode = document): AnchorRect[] {
  const rects: AnchorRect[] = []
  root.querySelectorAll<HTMLElement>(ANCHOR_SELECTOR).forEach((el) => {
    const r = el.getBoundingClientRect()
    rects.push({ left: r.left, top: r.top, width: r.width, height: r.height })
  })
  return rects
}
