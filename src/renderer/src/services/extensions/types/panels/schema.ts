/**
 * Tipo 'panels' — schema declarativo.
 *
 * Valida el slice `contributes.panels` del manifest: forma de cada item y
 * existencia del módulo del componente en el paquete. Las contribuciones
 * rotas se descartan con warning (una extensión rota jamás tumba el boot).
 */

import type { PanelId } from '@features/layout'
import type { ParseContext } from '../handler'

export interface PanelContribution {
  id: PanelId
  /** Título mostrado en el header del panel. */
  title: string
  closable?: boolean
  /** Ruta del componente relativa a la raíz del paquete. */
  component: string
}

export function parsePanelContributions(
  raw: unknown,
  ctx: ParseContext
): PanelContribution[] | null {
  if (!Array.isArray(raw)) return null
  const out: PanelContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<PanelContribution>
    if (
      typeof c.id !== 'string' ||
      typeof c.title !== 'string' ||
      typeof c.component !== 'string'
    ) {
      console.warn('[extensions/panels] contribución inválida descartada:', c)
      continue
    }
    if (!ctx.hasModule(c.component)) {
      console.warn(`[extensions/panels] "${c.id}" sin módulo: ${c.component}`)
      continue
    }
    out.push({
      id: c.id as PanelId,
      title: c.title,
      closable: c.closable,
      component: c.component
    })
  }
  return out
}
