// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Overlays SEF — componentes que aporta la extensión y el IDE monta en una capa.
 *
 * Dos capas:
 *  - `effects`    → encima de todo (efectos: un rayo, una explosión). El runtime
 *                   les manda eventos con `overlay.emit`.
 *  - `background` → detrás de la app (un cielo, niebla animada).
 *
 * `layer` por defecto: `effects`.
 */

import type { ParseContext } from '../handler'

export type OverlayLayer = 'effects' | 'background'

export interface OverlayContribution {
  id: string
  name: string
  /** Ruta del componente dentro del paquete. */
  component: string
  layer?: OverlayLayer
  /**
   * Props fijas que el pack quiere recibir. Se validan como JSON plano: viajan
   * tal cual al componente (nada de funciones ni código).
   */
  props?: Record<string, unknown>
}

export function parseOverlayContributions(
  raw: unknown,
  ctx: ParseContext
): OverlayContribution[] | null {
  if (!Array.isArray(raw)) {
    console.warn('[extensions/overlays] `contributes.overlays` debe ser un array')
    return null
  }
  const out: OverlayContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<OverlayContribution>
    if (
      typeof c.id !== 'string' ||
      !c.id.trim() ||
      typeof c.name !== 'string' ||
      typeof c.component !== 'string' ||
      !c.component.trim()
    ) {
      console.warn('[extensions/overlays] contribución inválida descartada:', c)
      continue
    }
    if (!ctx.hasModule(c.component)) {
      console.warn(`[extensions/overlays] "${c.id}": falta el módulo ${c.component}`)
      continue
    }
    const contribution: OverlayContribution = {
      id: c.id.trim(),
      name: c.name.trim(),
      component: c.component.trim()
    }
    if (c.layer === 'background' || c.layer === 'effects') contribution.layer = c.layer
    if (c.props && typeof c.props === 'object') contribution.props = c.props
    out.push(contribution)
  }
  return out
}
