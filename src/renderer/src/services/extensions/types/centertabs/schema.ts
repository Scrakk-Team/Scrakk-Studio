/**
 * Tipo 'centerTabs' — schema declarativo.
 * Valida el slice `contributes.centerTabs` del manifest.
 */

import type { PanelId } from '@features/layout'
import type { ParseContext } from '../handler'

export interface CenterTabContribution {
  /** Id que también identifica al panel que monta su contenido. */
  id: PanelId
  label: string
  /** Ruta del módulo del ícono (opcional). */
  icon?: string
  closable?: boolean
  /** Ruta del componente relativa a la raíz del paquete. */
  component: string
}

export function parseCenterTabContributions(
  raw: unknown,
  ctx: ParseContext
): CenterTabContribution[] | null {
  if (!Array.isArray(raw)) return null
  const out: CenterTabContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<CenterTabContribution>
    if (
      typeof c.id !== 'string' ||
      typeof c.label !== 'string' ||
      typeof c.component !== 'string'
    ) {
      console.warn('[extensions/centerTabs] contribución inválida descartada:', c)
      continue
    }
    if (!ctx.hasModule(c.component) || (c.icon !== undefined && !ctx.hasModule(c.icon))) {
      console.warn(`[extensions/centerTabs] "${c.id}" con módulos faltantes`)
      continue
    }
    out.push({
      id: c.id as PanelId,
      label: c.label,
      icon: typeof c.icon === 'string' ? c.icon : undefined,
      closable: c.closable,
      component: c.component
    })
  }
  return out
}
