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

interface WorkspacesHistoryPanelProps {
  /** Se llama al navegar (el host cierra el popover). */
  onNavigate?: () => void
}

/**
 * Historial de workspaces — contenido del popover anclado (botón de la
 * titlebar). Lista el historial con badge ACTIVO + botón de agregar.
 * Mismo lenguaje que el historial de notificaciones (popover sin overlay).
 */
export function WorkspacesHistoryPanel({ onNavigate }: WorkspacesHistoryPanelProps): JSX.Element {
  const [history, setHistory] = useState<string[]>(() => listWorkspaces())
  const [current, setCurrent] = useState<string | null>(() => getActiveWorkspace())

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
    const res = await window.api.fs.pickFolder()
    if (res.success && res.path) {
      recordWorkspace(res.path)
      setWorkspaceRoot(res.path)
      onNavigate?.()
    }
  }

  return (
    <div className={styles.panel}>
      {history.length === 0 ? (
        <p className={styles.empty}>Sin workspaces todavía.</p>
      ) : (
        <div className={styles.list} role="listbox" aria-label="Historial de workspaces">
          {history.map((path) => {
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
                  <ProductIcon id="folder" size={15} />
                </span>
                <span className={styles.rowMain}>
                  <span className={styles.rowTop}>
                    <span className={styles.rowName}>{baseNameOf(path)}</span>
                    {active ? <span className={styles.badge}>ACTIVO</span> : null}
                  </span>
                  <span className={styles.rowPath}>{path}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
      <button type="button" className={styles.add} onClick={() => void addWorkspace()}>
        <ProductIcon id="plus" size={13} />
        Agregar workspace
      </button>
    </div>
  )
}
