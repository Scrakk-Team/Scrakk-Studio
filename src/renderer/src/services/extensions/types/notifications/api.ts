/**
 * Tipo de extensión 'notifications' — API hacia la capa extensions.
 *
 * El handler registra contribuciones (v1: metadata); la API REAL que las
 * extensiones consumen vive en ctx.api.notifications (extensionApi) y usa
 * el mismo registry global que la app — un solo camino, cero duplicación.
 */

import type { AnyExtensionTypeHandler } from '../handler'
import {
  parseNotificationContributions,
  type NotificationContribution
} from './schema'
import { activateNotifications } from './logic'

interface RegisteredRef {
  extensionId: string
  count: number
}

export const notificationsHandler: AnyExtensionTypeHandler = {
  kind: 'notifications',

  parse(raw, ctx): NotificationContribution[] | null {
    return parseNotificationContributions(raw, ctx)
  },

  register(
    _contribution: NotificationContribution,
    ctx
  ): RegisteredRef {
    void activateNotifications()
    return { extensionId: ctx.extensionId, count: 1 }
  },

  unregister() {
    // Sin estado que limpiar: las notificaciones son efímeras.
  }
}
