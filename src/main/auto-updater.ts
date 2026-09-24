// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Instalador de actualizaciones (electron-updater).
 *
 * El aviso en vivo lo da `app-updates.ts` (Supabase Realtime). Este módulo es
 * el que DESCARGA e INSTALA: `checkForUpdates` → `downloadUpdate` →
 * `quitAndInstall` (cierra y reabre solo).
 *
 * Guardas: en desarrollo (`app.isPackaged === false`) y en Linux sin AppImage
 * no hay auto-update; se reporta `unsupported` y el renderer ofrece el enlace
 * a la release. El provider (GitHub Scrakk/Scrakk-Studio) sale del
 * `app-update.yml` que escribe electron-builder por la config `publish`.
 */

import { app, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { UPDATES_IPC, type UpdaterState } from '@shared/updates'
import { broadcast } from './broadcast'

let state: UpdaterState = { status: 'idle' }
let initialized = false

function emit(next: Partial<UpdaterState> & { status: UpdaterState['status'] }): UpdaterState {
  state = { ...state, ...next }
  broadcast(UPDATES_IPC.onUpdaterState, state)
  return state
}

/** ¿Se puede auto-actualizar esta instalación? */
function canAutoUpdate(): { ok: true } | { ok: false; reason: string } {
  if (!app.isPackaged) {
    return { ok: false, reason: 'La app corre desde el código fuente, no se auto-actualiza.' }
  }
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return { ok: false, reason: 'Sólo el AppImage se actualiza solo (esta instalación no lo es).' }
  }
  return { ok: true }
}

/** Conecta los eventos de electron-updater al renderer (una sola vez). */
export function initAutoUpdater(): void {
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => emit({ status: 'checking', error: undefined }))
  autoUpdater.on('update-available', (info) => emit({ status: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => emit({ status: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    emit({
      status: 'downloading',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    })
  )
  autoUpdater.on('update-downloaded', (info) => emit({ status: 'downloaded', version: info.version }))
  autoUpdater.on('error', (error) =>
    emit({ status: 'error', error: error?.message ?? String(error) })
  )

  const guard = canAutoUpdate()
  if (!guard.ok) emit({ status: 'unsupported', error: guard.reason })
}

export function updaterState(): UpdaterState {
  return state
}

/** Comprueba si hay una versión nueva (no descarga). */
export async function checkForUpdates(): Promise<UpdaterState> {
  const guard = canAutoUpdate()
  if (!guard.ok) return emit({ status: 'unsupported', error: guard.reason })
  initAutoUpdater()
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    return emit({ status: 'error', error: error instanceof Error ? error.message : String(error) })
  }
  return state
}

/** Descarga la actualización (si hace falta, comprueba antes). */
export async function downloadUpdate(): Promise<UpdaterState> {
  const guard = canAutoUpdate()
  if (!guard.ok) return emit({ status: 'unsupported', error: guard.reason })
  initAutoUpdater()

  if (state.status !== 'available' && state.status !== 'downloading') {
    await checkForUpdates()
    const after = updaterState()
    if (after.status !== 'available') return after
  }

  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    return emit({ status: 'error', error: error instanceof Error ? error.message : String(error) })
  }
  return state
}

/** Instala y reinicia la app (solo si ya está descargada). */
export function installUpdate(): void {
  const guard = canAutoUpdate()
  if (!guard.ok) return
  initAutoUpdater()
  if (state.status !== 'downloaded') return
  autoUpdater.quitAndInstall()
}

export function registerUpdaterIpc(): void {
  ipcMain.handle(UPDATES_IPC.updaterStateGet, () => updaterState())
  ipcMain.handle(UPDATES_IPC.updaterCheck, () => checkForUpdates())
  ipcMain.handle(UPDATES_IPC.updaterDownload, () => downloadUpdate())
  ipcMain.handle(UPDATES_IPC.updaterInstall, () => {
    installUpdate()
  })
}
