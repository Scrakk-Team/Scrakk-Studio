// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * NotificationRegistry — store central de notificaciones activas.
 *
 * La app Y las extensiones (vía ctx.api.notifications) usan ESTA MISMA
 * API. Nada hardcodeado: cualquier módulo llama notify() y el Host de la
 * capa layout pinta según esquina.
 */

import type {
  AppNotification,
  NotificationCorner,
  NotificationsListener,
  NotificationSeverity,
  NotificationButton,
  NotificationImage,
  NotificationHistoryEntry
} from './types'

const MAX_ACTIONS = 3
/** Tope del historial (memoria acotada: las viejas se descartan). */
const MAX_HISTORY = 50

class NotificationRegistryClass {
  private notifications = new Map<string, AppNotification>()
  /** `onClose` por id (no va en `AppNotification`: no es renderizable). */
  private closeCallbacks = new Map<string, () => void>()
  private listeners = new Set<NotificationsListener>()
  private seq = 0
  /** Historial acotado (nuevas primero): las ya cerradas/expiradas. */
  private historyRing: NotificationHistoryEntry[] = []

  subscribe(listener: NotificationsListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // suscriptor roto no tumba al resto
      }
    }
  }

  /**
   * Muestra una notificación. Devuelve su id.
   * `actions` se recorta a 3; imagen con clamp 500×500.
   */
  show(input: {
    title: string
    message?: string
    detail?: string
    severity?: NotificationSeverity
    corner?: NotificationCorner
    timeoutMs?: number
    actions?: NotificationButton[]
    image?: NotificationImage
    /**
     * Se llama cuando la notificación se CIERRA sin elegir un botón (X,
     * timeout o `dismiss`). Sin esto, quien espera una respuesta del usuario
     * (una extensión llamando `showInformationMessage`) se queda esperando
     * para siempre.
     */
    onClose?: () => void
  }): string {
    const id = `notif-${Date.now()}-${++this.seq}`
    const notification: AppNotification = {
      id,
      title: input.title,
      message: input.message,
      detail: input.detail,
      severity: input.severity ?? 'info',
      corner: input.corner ?? 'tr',
      timeoutMs: input.timeoutMs ?? 0,
      actions: (input.actions ?? []).slice(0, MAX_ACTIONS).map((action) => ({
        label: action.label,
        run: action.run
      })),
      image: clampImage(input.image),
      createdAt: Date.now()
    }

    this.notifications.set(id, notification)
    if (input.onClose) this.closeCallbacks.set(id, input.onClose)

    if (notification.timeoutMs && notification.timeoutMs > 0) {
      const timer: ReturnType<typeof setTimeout> = setTimeout(
        () => this.dismiss(id),
        notification.timeoutMs
      )
      const maybe = timer as unknown as { unref?: () => void }
      maybe.unref?.()
    }

    this.emit()
    return id
  }

  dismiss(id: string): void {
    const notification = this.notifications.get(id)
    if (!notification) return
    this.notifications.delete(id)
    // Snapshot al historial (sin callbacks: solo lectura).
    this.historyRing.unshift({ ...notification, actions: [], dismissedAt: Date.now() })
    if (this.historyRing.length > MAX_HISTORY) {
      this.historyRing.length = MAX_HISTORY
    }
    const onClose = this.closeCallbacks.get(id)
    this.closeCallbacks.delete(id)
    this.emit()
    // Al final: el callback no puede tocar el estado a mitad del cierre.
    onClose?.()
  }

  list(): AppNotification[] {
    return [...this.notifications.values()]
  }

  byCorner(corner: NotificationCorner): AppNotification[] {
    return this.list().filter((n) => n.corner === corner)
  }

  /** Historial de cerradas/expiradas (nuevas primero). Solo lectura. */
  history(): NotificationHistoryEntry[] {
    return [...this.historyRing]
  }

  /** Vacía el historial (las activas no se tocan). */
  clearHistory(): void {
    if (this.historyRing.length === 0) return
    this.historyRing = []
    this.emit()
  }
}

/** Clamp de imagen: máximo 500×500 px. */
function clampImage(image: NotificationImage | undefined): NotificationImage | undefined {
  if (!image?.src) return undefined
  const clamp = (value: number | undefined): number | undefined =>
    value === undefined ? undefined : Math.max(1, Math.min(500, Math.round(value)))
  return {
    src: image.src,
    width: clamp(image.width),
    height: clamp(image.height),
    rounded: image.rounded ?? true
  }
}

export const notificationRegistry = new NotificationRegistryClass()
