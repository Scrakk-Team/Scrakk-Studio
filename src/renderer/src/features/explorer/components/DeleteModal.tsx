// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Modal de confirmación de borrado (simple o múltiple). Usa la primitiva
 * Modal de la app — plano, cápsula, sin sombras.
 */

import { useState, type JSX } from 'react'
import { Modal } from '@ui'
import styles from './DeleteModal.module.css'

export interface DeleteTarget {
  /** Nombre del item principal (o "N elementos"). */
  label: string
  /** Rutas a borrar. */
  paths: string[]
}

interface DeleteModalProps {
  target: DeleteTarget | null
  onCancel: () => void
  onConfirm: (paths: string[]) => Promise<void>
}

export function DeleteModal({ target, onCancel, onConfirm }: DeleteModalProps): JSX.Element | null {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!target) return null

  const handleConfirm = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm(target.paths)
      onCancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar.')
      setBusy(false)
    }
  }

  const multiple = target.paths.length > 1

  return (
    <Modal open onClose={busy ? () => {} : onCancel} title="Eliminar">
      <div className={styles.body}>
        <p className={styles.text}>
          {multiple
            ? `¿Eliminar ${target.paths.length} elementos? Esta acción no se puede deshacer.`
            : `¿Eliminar "${target.label}"? Esta acción no se puede deshacer.`}
        </p>
        {multiple ? (
          <ul className={styles.list}>
            {target.paths.map((path) => (
              <li key={path} className={styles.item}>
                {path}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.path}>{target.paths[0]}</p>
        )}
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.confirm}
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
