// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Notificaciones — API pública.
 *
 * Un solo camino para la app y las extensiones (ctx.api.notifications):
 * notify() con esquina, severidad, timeout, imagen (clamp 500×500) y hasta
 * 3 botones con callbacks arbitrarios.
 */

import { notificationRegistry } from './registry'
import type {
  AppNotification,
  NotificationCorner,
  NotificationHistoryEntry,
  NotificationImage,
  NotificationsListener,
  NotificationSeverity
} from './types'

export { notificationRegistry }
export type {
  AppNotification,
  NotificationCorner,
  NotificationHistoryEntry,
  NotificationSeverity,
  NotificationImage
}

export interface NotifyInput {
  title: string
  message?: string
  /** Texto largo de apoyo (`MessageOptions.detail` de VS Code). */
  detail?: string
  severity?: NotificationSeverity
  /** Esquina de pantalla: 'tl' | 'tr' | 'bl' | 'br'. Default: 'tr'. */
  corner?: NotificationCorner
  /**
   * Auto-cerrar en ms. **0 = persistente** (hay que cerrarla a mano). Si no se
   * pasa, se usa el default por severidad: info/success 6s, warn 8s, error 10s.
   * La raya inferior de la notificación se vacía a lo largo de este tiempo.
   */
  timeoutMs?: number
  /** Máximo 3 botones con callbacks arbitrarios. */
  actions?: Array<{ label: string; run: () => void }>
  /** Imagen opcional (máx 500×500 px, redondeo configurable). */
  image?: NotificationImage
  /** Se llama si la notificación se cierra SIN elegir un botón. */
  onClose?: () => void
}

/** Tiempo por defecto hasta auto-cerrar, por severidad (ms; 0 = persistente). */
const DEFAULT_TIMEOUT_MS: Record<NotificationSeverity, number> = {
  info: 6000,
  success: 6000,
  warn: 8000,
  error: 10000
}

/** Muestra una notificación y devuelve su id. */
export function notify(input: NotifyInput): string {
  return notificationRegistry.show({
    title: input.title,
    message: input.message,
    detail: input.detail,
    severity: input.severity,
    corner: input.corner,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS[input.severity ?? 'info'],
    actions: input.actions,
    image: input.image,
    onClose: input.onClose
  })
}

export function dismissNotification(id: string): void {
  notificationRegistry.dismiss(id)
}

export function listNotifications(): AppNotification[] {
  return notificationRegistry.list()
}

/** Historial de cerradas/expiradas (nuevas primero). Solo lectura. */
export function notificationHistory(): NotificationHistoryEntry[] {
  return notificationRegistry.history()
}

/** Vacía el historial (las activas no se tocan). */
export function clearNotificationHistory(): void {
  notificationRegistry.clearHistory()
}

export function subscribeToNotifications(listener: NotificationsListener): () => void {
  return notificationRegistry.subscribe(listener)
}
