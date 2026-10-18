// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { setWorkspaceRoot } from '@features/explorer'
import {
  baseNameOf,
  getActiveWorkspace,
  listWorkspaces,
  recordWorkspace,
  subscribeToWorkspaces
} from '@services/workspaces'
import styles from './WorkspacesHistoryPanel.module.css'

import { t } from '@core/i18n'
import { api } from '@services/api'
interface WorkspacesHistoryPanelProps {
  /** Se llama al navegar (el host cierra el popover). */
  onNavigate?: () => void
}

/** Cuántas cards se muestran por página en el popover. */
const PAGE_SIZE = 6

/**
 * Historial de workspaces — contenido del popover anclado (botón de la
 * titlebar). Lista el historial + botón de agregar.
 * Mismo lenguaje que el historial de notificaciones (popover sin overlay).
 */
export function WorkspacesHistoryPanel({ onNavigate }: WorkspacesHistoryPanelProps): JSX.Element {
  const [history, setHistory] = useState<string[]>(() => listWorkspaces())
  const [current, setCurrent] = useState<string | null>(() => getActiveWorkspace())
  const [page, setPage] = useState(0)

  useEffect(() => {
    const sync = (): void => {
      setHistory(listWorkspaces())
      setCurrent(getActiveWorkspace())
    }
    sync()
    const unsubHistory = subscribeToWorkspaces(sync)
    window.addEventListener('workspace-changed', sync)
    return () => {
      unsubHistory()
      window.removeEventListener('workspace-changed', sync)
    }
  }, [])

  const openWorkspace = (path: string): void => {
    if (path === current) {
      onNavigate?.()
      return
    }
    recordWorkspace(path)
    setWorkspaceRoot(path)
    onNavigate?.()
  }

  const addWorkspace = async (): Promise<void> => {
    const res = await api.fs.pickFolder()
    if (res.success && res.path) {
      recordWorkspace(res.path)
      setWorkspaceRoot(res.path)
      onNavigate?.()
    }
  }

  // Paginación (no scroll): `current` ya es el workspace activo, así que la
  // página va en `currentPage`. Se recorta por si el historial encoge
  // (desinstalar/olvidar) mientras el popover está abierto.
  const pageCount = Math.max(1, Math.ceil(history.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = history.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className={styles.panel}>
      {/* Cabecera propia (el spec va con hideHeader): así el paginador queda
          alineado con el título y comparte estado con la lista. */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>{t('titlebar.workspaces')}</span>
        {pageCount > 1 ? (
          <div className={styles.pager}>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={currentPage === 0}
              aria-label={t('features.pagina.anterior')}
              onClick={() => setPage(Math.max(0, currentPage - 1))}
            >
              <ProductIcon id="chevron-right" size={12} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <span className={styles.pagerLabel}>
              {currentPage + 1} / {pageCount}
            </span>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={currentPage === pageCount - 1}
              aria-label={t('features.pagina.siguiente')}
              onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
            >
              <ProductIcon id="chevron-right" size={12} />
            </button>
          </div>
        ) : null}
      </div>
      {history.length === 0 ? (
        <p className={styles.empty}>{t('titlebar.sin.workspaces.todavia')}</p>
      ) : (
        <div className={styles.list} role="listbox" aria-label={t('titlebar.historial.de.workspaces')}>
          {visible.map((path) => {
            const active = path === current
            return (
              <button
                key={path}
                type="button"
                role="option"
                aria-selected={active}
                className={[styles.row, active ? styles.rowActive : null]
                  .filter(Boolean)
                  .join(' ')}
                title={path}
                onClick={() => openWorkspace(path)}
              >
                <span className={styles.rowIcon} aria-hidden="true">
                  <ProductIcon id="folder" size={13} />
                </span>
                <span className={styles.rowMain}>
                  <span className={styles.rowTop}>
                    <span className={styles.rowName}>{baseNameOf(path)}</span>
                  </span>
                  <span className={styles.rowPath}>{path}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      <button type="button" className={styles.add} onClick={() => void addWorkspace()}>
        <ProductIcon id="plus" size={12} />
        {t('titlebar.agregar.workspace')}
      </button>
    </div>
  )
}
