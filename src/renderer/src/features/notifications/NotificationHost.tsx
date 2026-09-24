// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * NotificationHost — pinta las 4 esquinas desde el registry.
 *
 * Montado UNA vez en AppShell. Cada esquina tiene su stack propio;
 * click en × = dismiss; los botones ejecutan sus callbacks y cierran.
 */

import { useEffect, useState, type JSX } from 'react'
import { notificationRegistry } from '@services/notifications/registry'
import type { AppNotification, NotificationCorner } from '@services/notifications/types'
import { ProductIcon } from '@services/productIcons/components'
import styles from './NotificationHost.module.css'

const CORNERS: NotificationCorner[] = ['tl', 'tr', 'bl', 'br']

function severityIcon(severity: string): string {
  switch (severity) {
    case 'success': return '✓'
    case 'warn': return '⚠'
    case 'error': return '✕'
    default: return 'ℹ'
  }
}

export function NotificationHost(): JSX.Element {
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  useEffect(() => {
    const refresh = (): void => setNotifications(notificationRegistry.list())
    refresh()
    return notificationRegistry.subscribe(refresh)
  }, [])

  const byCorner = (corner: NotificationCorner): AppNotification[] =>
    notifications.filter((n) => n.corner === corner)

  return (
    <>
      {CORNERS.map((corner) => {
        const items = byCorner(corner)
        if (items.length === 0) return null
        return (
          <div
            key={corner}
            className={[styles.stack, styles[`stack_${corner}`] ?? null]
              .filter(Boolean)
              .join(' ')}
            role="region"
            aria-label={`Notificaciones ${corner}`}
          >
            {items.map((notification) => {
              const timed = (notification.timeoutMs ?? 0) > 0
              return (
                <div
                  key={notification.id}
                  className={[styles.card, styles[notification.severity] ?? null]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className={styles.header}>
                    <span className={styles.severityIcon} aria-hidden="true">
                      {severityIcon(notification.severity)}
                    </span>
                    <span className={styles.title}>{notification.title}</span>
                    <button
                      type="button"
                      className={styles.close}
                      aria-label="Cerrar notificación"
                      onClick={() => notificationRegistry.dismiss(notification.id)}
                    >
                      <ProductIcon id="x" size={10} />
                    </button>
                  </div>

                  {notification.message ? (
                    <p className={styles.message}>{notification.message}</p>
                  ) : null}

                  {notification.detail ? (
                    <p className={styles.detail}>{notification.detail}</p>
                  ) : null}

                  {notification.image ? (
                    <img
                      src={notification.image.src}
                      alt=""
                      className={[
                        styles.image,
                        notification.image.rounded === false ? null : styles.imageRounded
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        maxWidth: Math.min(notification.image.width ?? 500, 500),
                        maxHeight: Math.min(notification.image.height ?? 500, 500)
                      }}
                    />
                  ) : null}

                  {notification.actions && notification.actions.length > 0 ? (
                    <div className={styles.actions}>
                      {notification.actions.map((action, index) => (
                        <button
                          key={index}
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => {
                            action.run()
                            notificationRegistry.dismiss(notification.id)
                          }}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {/* Raya inferior: color por severidad. Con timeout, se
                      "vacía" a lo largo de esa duración (el tiempo que le
                      queda). Sin timeout queda llena (persistente). */}
                  <span
                    className={[styles.progress, timed ? styles.progressTimed : null]
                      .filter(Boolean)
                      .join(' ')}
                    style={timed ? { animationDuration: `${notification.timeoutMs}ms` } : undefined}
                    aria-hidden="true"
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
