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
import { pickOption } from '@services/modals'
import { SCRAKK_WEBSITE } from '@shared/links'
import styles from './InfoSection.module.css'

import { t } from '@core/i18n'
export function InfoSection(): JSX.Element {
  const updates = useUpdates()
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [uninstalling, setUninstalling] = useState(false)
  const [uninstallError, setUninstallError] = useState<string | null>(null)

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
        setMessage(t('settings.estas.al.dia', { version: updates.currentVersion }))
      } else if (state.status === 'available') {
        setMessage(t('settings.nueva.version', { version: version ?? '' }))
      } else if (state.status === 'unsupported') {
        setMessage(
          release && updates.updateAvailable
            ? t('settings.nueva.version', { version: release.version })
            : t('settings.esta.instalacion.no.se.actualiza')
        )
      } else if (state.status === 'error') {
        setMessage(state.error ?? t('settings.no.se.pudo.comprobar'))
      } else {
        setMessage(t('settings.no.se.pudo.comprobar'))
      }
    } finally {
      setChecking(false)
    }
  }

  /**
   * Desinstala la app del sistema. Pide confirmación (acción destructiva) y
   * delega en el main, que detecta el formato (NSIS / AppImage / deb / tar.gz).
   * En éxito la app se cierra sola; si vuelve `ok: false`, se muestra el motivo
   * (p. ej. hace falta root y queda el comando a mano).
   */
  const handleUninstall = async (): Promise<void> => {
    const choice = await pickOption(t('settings.desinstalar.confirmar.titulo'), [
      { id: 'cancel', label: t('settings.cancelar') },
      {
        id: 'uninstall',
        label: t('settings.desinstalar'),
        description: t('settings.desinstalar.confirmar.detalle'),
        danger: true
      }
    ])
    if (choice !== 'uninstall') return

    setUninstalling(true)
    setUninstallError(null)
    const result = await window.api.app.uninstall()
    if (!result.ok) setUninstallError(result.error ?? t('settings.no.se.pudo.desinstalar'))
    setUninstalling(false)
  }

  return (
    <div className={styles.info}>
      <p><strong>{t('settings.scrakk.studio')}</strong> {t('settings.acerca.descripcion')}</p>
      <p>{t('settings.creado.por.scrakk.team')}</p>
      <p className={styles.version}>
        v{updates.currentVersion} {t('settings.build')} {typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}
      </p>

      <div className={styles.updates}>
        <div className={styles.updateRow}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => void handleCheck()}
            disabled={checking || downloading}
          >
            {checking ? t('settings.buscando') : t('settings.buscar.actualizaciones')}
          </button>

          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => window.open(SCRAKK_WEBSITE, '_blank', 'noopener')}
          >
            {t('settings.ver.mas')}
          </button>

          {downloaded && (
            <button
              type="button"
              className={styles.actionBtnPrimary}
              onClick={() => void installUpdate()}
            >
              {t('settings.reiniciar.y.actualizar')}
            </button>
          )}

          {!downloaded && updater.status === 'available' && (
            <button
              type="button"
              className={styles.actionBtnPrimary}
              onClick={() => void downloadUpdate()}
            >
              {t('settings.descargar.v')}{updater.version}
            </button>
          )}

          {!downloaded && updates.updateAvailable && updater.status === 'unsupported' && (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => openReleasePage()}
            >
              {t('settings.ver.release.v')}{updates.latest?.version}
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
              ? t('settings.descargando.porcentaje', {
                  percent: String(Math.round(updater.percent ?? 0))
                })
              : downloaded
                ? t('settings.lista.para.instalar', { version: updater.version ?? '' })
                : updater.status === 'unsupported'
                  ? updates.updateAvailable
                    ? t('settings.nueva.version', { version: updates.latest?.version ?? '' })
                    : t('settings.al.dia')
                  : updates.updateAvailable
                    ? t('settings.nueva.version', { version: updates.latest?.version ?? '' })
                    : t('settings.al.dia'))}
        </p>
      </div>

      {/* Desinstalar: acción destructiva del sistema, fuera del bloque de
          actualizaciones y con confirmación previa. */}
      <div className={styles.danger}>
        <button
          type="button"
          className={styles.dangerBtn}
          onClick={() => void handleUninstall()}
          disabled={uninstalling}
        >
          {t('settings.desinstalar')}
        </button>
        {uninstallError ? <p className={styles.dangerError}>{uninstallError}</p> : null}
      </div>
    </div>
  )
}
