// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { setWorkspaceRoot } from '@features/explorer'
import {
  baseNameOf,
  getActiveWorkspace,
  nextWorkspace,
  prevWorkspace,
  recordWorkspace,
  subscribeToWorkspaces
} from '@services/workspaces'
import {
  showAnchoredModal,
  anchoredModalId,
  subscribeToModals,
  type AnchoredRect
} from '@services/modals'
import { WorkspacesHistoryPanel } from './WorkspacesHistoryPanel'
import styles from './WorkspacesWidget.module.css'

/** Key del popover de workspaces en el registry de modales (para toggle). */
const WORKSPACES_POPOVER_KEY = 'workspaces-history'

/**
 * Widget Workspaces de la titlebar: botón con el nombre de la carpeta del
 * proyecto activo (real, nunca hardcodeado) + navegación ‹ › por el
 * historial. Si no hay workspace a la derecha, muestra + (agregar).
 * El nombre abre el historial en el popover anclado global (sin overlay).
 */
export function WorkspacesWidget(): JSX.Element {
  const nameRef = useRef<HTMLButtonElement | null>(null)
  const [current, setCurrent] = useState<string | null>(() => getActiveWorkspace())
  const [, setTick] = useState(0)
  const [popoverOpen, setPopoverOpen] = useState(false)

  useEffect(() => {
    const sync = (): void => {
      setCurrent(getActiveWorkspace())
      setTick((t) => t + 1)
    }
    sync()
    const unsubHistory = subscribeToWorkspaces(sync)
    const onWorkspaceChanged = (): void => sync()
    window.addEventListener('workspace-changed', onWorkspaceChanged)
    const unsubModals = subscribeToModals(() => {
      setPopoverOpen(anchoredModalId(WORKSPACES_POPOVER_KEY) !== null)
    })
    return () => {
      unsubHistory()
      window.removeEventListener('workspace-changed', onWorkspaceChanged)
      unsubModals()
    }
  }, [])

  const openHistory = useCallback((): void => {
    const button = nameRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const anchor: AnchoredRect = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
    showAnchoredModal({
      key: WORKSPACES_POPOVER_KEY,
      title: 'Workspaces',
      anchor,
      width: 300,
      placement: 'below',
      align: 'center',
      render: ({ close }) => <WorkspacesHistoryPanel onNavigate={close} />
    })
  }, [])

  const addWorkspace = useCallback(async (): Promise<void> => {
    const res = await window.api.fs.pickFolder()
    if (res.success && res.path) {
      recordWorkspace(res.path)
      setWorkspaceRoot(res.path)
    }
  }, [])

  const goTo = useCallback((path: string | null): void => {
    if (!path) return
    recordWorkspace(path)
    setWorkspaceRoot(path)
  }, [])

  const prev = prevWorkspace(current)
  const next = nextWorkspace(current)
  const label = current ? baseNameOf(current) : 'Sin workspace'

  return (
    <div className={styles.widget} role="group" aria-label="Workspaces">
      <button
        type="button"
        className={styles.nav}
        aria-label="Workspace anterior"
        title={prev ? `Ir a ${baseNameOf(prev)}` : 'Sin workspace anterior'}
        disabled={!prev}
        onClick={() => goTo(prev)}
      >
        <ProductIcon id="chevron-right" size={13} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <button
        ref={nameRef}
        type="button"
        className={[styles.name, popoverOpen ? styles.nameOpen : null].filter(Boolean).join(' ')}
        aria-label={`Workspace activo: ${label}. Abrir historial`}
        aria-expanded={popoverOpen}
        title={current ?? label}
        onClick={openHistory}
      >
        <span className={styles.nameText}>{label}</span>
      </button>
      {next ? (
        <button
          type="button"
          className={styles.nav}
          aria-label="Workspace siguiente"
          title={`Ir a ${baseNameOf(next)}`}
          onClick={() => goTo(next)}
        >
          <ProductIcon id="chevron-right" size={13} />
        </button>
      ) : (
        <button
          type="button"
          className={styles.nav}
          aria-label="Agregar workspace"
          title="Agregar workspace"
          onClick={() => void addWorkspace()}
        >
          <ProductIcon id="plus" size={13} />
        </button>
      )}
    </div>
  )
}
