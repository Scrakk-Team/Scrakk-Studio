/**
 * Tipo de extensión 'notifications' — schema.
 *
 * v1: la contribución es OPCIONAL (el tipo existe principalmente como
 * portador de la API ctx.api.notifications). Si una extensión declara
 * contribuciones, validamos forma básica para futuras plantillas de noti.
 */

import type { ParseContext } from '../handler'

export interface NotificationContribution {
  id: string
  title: string
  corner?: 'tl' | 'tr' | 'bl' | 'br'
}

export function parseNotificationContributions(
  raw: unknown,
  _ctx: ParseContext
): NotificationContribution[] | null {
  if (!Array.isArray(raw)) return null
  const out: NotificationContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<NotificationContribution>
    if (typeof c.id !== 'string' || typeof c.title !== 'string') continue
    out.push({
      id: c.id,
      title: c.title,
      corner:
        c.corner === 'tl' || c.corner === 'tr' || c.corner === 'bl' || c.corner === 'br'
          ? c.corner
          : undefined
    })
  }
  return out
}
