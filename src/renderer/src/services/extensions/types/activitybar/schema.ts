// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'activityBar' — schema declarativo.
 * Valida el slice `contributes.activityBar` del manifest.
 */

import type { PanelId, SlotId } from '@features/layout'
import type { ActivityBarSide } from '@features/activitybar'
import type { ParseContext } from '../handler'

export interface ActivityBarContribution {
  id: string
  label: string
  /** Ruta del módulo del ícono (export default ComponentType) relativa al paquete. */
  icon: string
  side: ActivityBarSide
  target: SlotId
  panelId: PanelId
  order?: number
}

const SIDES: readonly string[] = ['left', 'right']

export function parseActivityBarContributions(
  raw: unknown,
  ctx: ParseContext
): ActivityBarContribution[] | null {
  if (!Array.isArray(raw)) return null
  const out: ActivityBarContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<ActivityBarContribution>
    if (
      typeof c.id !== 'string' ||
      typeof c.label !== 'string' ||
      typeof c.icon !== 'string' ||
      typeof c.side !== 'string' ||
      typeof c.target !== 'string' ||
      typeof c.panelId !== 'string'
    ) {
      console.warn('[extensions/activityBar] contribución inválida descartada:', c)
      continue
    }
    if (!SIDES.includes(c.side)) {
      console.warn(`[extensions/activityBar] "${c.id}" side inválido: ${c.side}`)
      continue
    }
    if (!ctx.hasModule(c.icon)) {
      console.warn(`[extensions/activityBar] "${c.id}" sin módulo de ícono: ${c.icon}`)
      continue
    }
    out.push({
      id: c.id,
      label: c.label,
      icon: c.icon,
      side: c.side as ActivityBarSide,
      target: c.target as SlotId,
      panelId: c.panelId as PanelId,
      order: typeof c.order === 'number' ? c.order : undefined
    })
  }
  return out
}
