// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección Acerca de — info del producto + actualizaciones.
 *
 * El aviso en vivo lo dispara `UpdatesBridge` (notificación global). Aquí está
 * el detalle: versión, estado, "Buscar actualizaciones", progreso de descarga y
 * el botón de reiniciar cuando ya está descargada.
 */

import { useState, type JSX } from 'react'
import {
  downloadUpdate,
  installUpdate,
  openReleasePage,
  refreshLatest,
  useUpdates
} from '@services/updates'
import styles from './InfoSection.module.css'

export function InfoSection(): JSX.Element {
  const updates = useUpdates()
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const updater = updates.updater
  const downloading = updater.status === 'downloading'
  const downloaded = updater.status === 'downloaded'

  const handleCheck = async (): Promise<void> => {
    setChecking(true)
    setMessage(null)
    try {
      const state = await window.api.updates.updaterCheck()
      const release = await refreshLatest()
      const version = state.version ?? release?.version ?? updates.latest?.version

      if (state.status === 'not-available') {
        setMessage(`Estás al día (v${updates.currentVersion}).`)
      } else if (state.status === 'available') {
        setMessage(`Nueva versión v${version} disponible.`)
      } else if (state.status === 'unsupported') {
        setMessage(
          release && updates.updateAvailable
            ? `Nueva versión v${release.version} disponible.`
            : 'Esta instalación no se actualiza sola.'
        )
      } else if (state.status === 'error') {
        setMessage(state.error ?? 'No se pudo comprobar.')
      } else {
        setMessage('No se pudo comprobar.')
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className={styles.info}>
      <p><strong>Scrakk Studio</strong> — Editor de código.</p>
      <p>React + TypeScript + Electron. Sistema de paneles resizables y extensiones.</p>
      <p className={styles.version}>
        v{updates.currentVersion} · build {typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}
      </p>

      <div className={styles.updates}>
        <div className={styles.updateRow}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => void handleCheck()}
            disabled={checking || downloading}
          >
            {checking ? 'Buscando…' : 'Buscar actualizaciones'}
          </button>

          {downloaded && (
            <button
              type="button"
              className={styles.actionBtnPrimary}
              onClick={() => void installUpdate()}
            >
              Reiniciar y actualizar
            </button>
          )}

          {!downloaded && updater.status === 'available' && (
            <button
              type="button"
              className={styles.actionBtnPrimary}
              onClick={() => void downloadUpdate()}
            >
              Descargar v{updater.version}
            </button>
          )}

          {!downloaded && updates.updateAvailable && updater.status === 'unsupported' && (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => openReleasePage()}
            >
              Ver release v{updates.latest?.version}
            </button>
          )}
        </div>

        {downloading && (
          <div className={styles.progress}>
            <div
              className={styles.progressBar}
              style={{ width: `${Math.round(updater.percent ?? 0)}%` }}
            />
          </div>
        )}

        <p className={styles.status}>
          {message ??
            (downloading
              ? `Descargando… ${Math.round(updater.percent ?? 0)}%`
              : downloaded
                ? `v${updater.version} lista para instalar.`
                : updater.status === 'unsupported'
                  ? updates.updateAvailable
                    ? `Nueva versión v${updates.latest?.version} disponible.`
                    : 'Al día.'
                  : updates.updateAvailable
                    ? `Nueva versión v${updates.latest?.version} disponible.`
                    : 'Al día.')}
        </p>
      </div>
    </div>
  )
}
