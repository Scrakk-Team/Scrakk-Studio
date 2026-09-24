// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Panel de historial de notificaciones — contenido del popover anclado
 * (botón campana de la statusbar). Lista las ACTIVAS (con dismiss) y el
 * HISTORIAL de cerradas (solo lectura + limpiar). Mismo lenguaje visual
 * que las cards del host (acento de severidad abajo).
 */

import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import {
  notificationRegistry,
  dismissNotification,
  clearNotificationHistory
} from '@services/notifications'
import type {
  AppNotification,
  NotificationHistoryEntry,
  NotificationSeverity
} from '@services/notifications'
import styles from './NotificationsHistoryPanel.module.css'

const SEVERITY_DOT: Record<NotificationSeverity, string> = {
  info: styles.dotInfo,
  success: styles.dotSuccess,
  warn: styles.dotWarn,
  error: styles.dotError
}

function timeAgo(epochMs: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - epochMs) / 1000))
  if (seconds < 10) return 'ahora'
  if (seconds < 60) return `hace ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

function ActiveRow({ notification }: { notification: AppNotification }): JSX.Element {
  return (
    <div className={[styles.row, SEVERITY_DOT[notification.severity]].join(' ')}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{notification.title}</span>
        {notification.message ? (
          <p className={styles.rowMessage}>{notification.message}</p>
        ) : null}
        <span className={styles.rowMeta}>
          activa
          {notification.createdAt ? ` · ${timeAgo(notification.createdAt)}` : ''}
        </span>
      </div>
      <button
        type="button"
        className={styles.rowClose}
        aria-label="Cerrar notificación"
        onClick={() => dismissNotification(notification.id)}
      >
        <ProductIcon id="x" size={11} />
      </button>
    </div>
  )
}

function HistoryRow({ entry }: { entry: NotificationHistoryEntry }): JSX.Element {
  return (
    <div className={[styles.row, styles.rowPast, SEVERITY_DOT[entry.severity]].join(' ')}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{entry.title}</span>
        {entry.message ? <p className={styles.rowMessage}>{entry.message}</p> : null}
        <span className={styles.rowMeta}>{timeAgo(entry.dismissedAt)}</span>
      </div>
    </div>
  )
}

export function NotificationsHistoryPanel(): JSX.Element {
  const [, setTick] = useState(0)

  useEffect(() => notificationRegistry.subscribe(() => setTick((t) => t + 1)), [])

  const active = notificationRegistry.list()
  const past = notificationRegistry.history()

  if (active.length === 0 && past.length === 0) {
    return <p className={styles.empty}>Sin notificaciones todavía.</p>
  }

  return (
    <div className={styles.list}>
      {active.length > 0 ? (
        <section aria-label="Notificaciones activas">
          <h3 className={styles.sectionTitle}>Activas</h3>
          {active.map((notification) => (
            <ActiveRow key={notification.id} notification={notification} />
          ))}
        </section>
      ) : null}

      {past.length > 0 ? (
        <section aria-label="Historial de notificaciones">
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>Historial</h3>
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => clearNotificationHistory()}
            >
              Limpiar
            </button>
          </div>
          {past.map((entry) => (
            <HistoryRow key={`${entry.id}-${entry.dismissedAt}`} entry={entry} />
          ))}
        </section>
      ) : null}
    </div>
  )
}
