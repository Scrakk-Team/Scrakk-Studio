// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Panel de historial de notificaciones — contenido del popover anclado
 * (botón campana de la statusbar). Lista las ACTIVAS (con dismiss) y el
 * HISTORIAL de cerradas (solo lectura + limpiar). Mismo lenguaje visual
 * que las cards del host (acento de severidad abajo).
 */

import { Fragment, useEffect, useState, type JSX } from 'react'
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

import { t } from '@core/i18n'
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
        aria-label={t('features.cerrar.notificacion')}
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

/** Cuántas tarjetas se muestran por página en el popover. */
const PAGE_SIZE = 5

/** Fila unificada del panel: una activa o una del historial. */
type PanelItem =
  | { kind: 'active'; notification: AppNotification }
  | { kind: 'past'; entry: NotificationHistoryEntry }

export function NotificationsHistoryPanel(): JSX.Element {
  const [, setTick] = useState(0)
  const [page, setPage] = useState(0)

  useEffect(() => notificationRegistry.subscribe(() => setTick((t) => t + 1)), [])

  const active = notificationRegistry.list()
  const past = notificationRegistry.history()

  // Activas primero, luego el historial: UNA sola lista paginada. El título de
  // cada grupo se pinta cuando el grupo cambia dentro de la página.
  const items: PanelItem[] = [
    ...active.map((notification): PanelItem => ({ kind: 'active', notification })),
    ...past.map((entry): PanelItem => ({ kind: 'past', entry }))
  ]
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = items.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className={styles.panel}>
      {/* Cabecera propia (el spec va con hideHeader): el paginador queda
          alineado con el título, igual que en el historial de workspaces. */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>{t('statusbar.notificaciones')}</span>
        {pageCount > 1 ? (
          <div className={styles.pager}>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={current === 0}
              aria-label={t('features.pagina.anterior')}
              onClick={() => setPage(Math.max(0, current - 1))}
            >
              <ProductIcon id="chevron-right" size={12} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <span className={styles.pagerLabel}>
              {current + 1} / {pageCount}
            </span>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={current === pageCount - 1}
              aria-label={t('features.pagina.siguiente')}
              onClick={() => setPage(Math.min(pageCount - 1, current + 1))}
            >
              <ProductIcon id="chevron-right" size={12} />
            </button>
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>{t('features.sin.notificaciones.todavia')}</p>
      ) : null}

      <div className={styles.list}>
        {visible.map((item, index) => {
          const startsGroup = index === 0 || visible[index - 1].kind !== item.kind
          const key =
            item.kind === 'active'
              ? `active-${item.notification.id}`
              : `past-${item.entry.id}-${item.entry.dismissedAt}`
          return (
            <Fragment key={key}>
              {startsGroup ? (
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionTitle}>
                    {item.kind === 'active' ? t('features.activas') : t('features.historial')}
                  </h3>
                  {item.kind === 'past' ? (
                    <button
                      type="button"
                      className={styles.clearBtn}
                      onClick={() => clearNotificationHistory()}
                    >
                      {t('features.limpiar')}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {item.kind === 'active' ? (
                <ActiveRow notification={item.notification} />
              ) : (
                <HistoryRow entry={item.entry} />
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
