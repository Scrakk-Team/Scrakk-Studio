/**
 * Estado de actualizaciones (renderer).
 *
 * Fuentes:
 *  - `getLatest()` al montar (una lectura).
 *  - `onRelease` (Realtime): la versión nueva llega empujada.
 *  - `onUpdaterState`: progreso del instalador (electron-updater).
 *
 * Store mínimo con `subscribe` + `useSyncExternalStore` (sin dependencias).
 * `hasNews` = hay una versión más nueva que la app y todavía no se vio.
 */

import { useSyncExternalStore } from 'react'
import { isNewerVersion } from '@shared/version'
import type { ReleaseInfo, UpdaterState } from '@shared/updates'
import { notify } from '@services/notifications'

const SEEN_KEY = 'updates:seen-version'

export interface UpdatesSnapshot {
  currentVersion: string
  latest: ReleaseInfo | null
  updateAvailable: boolean
  /** Hay versión nueva sin ver (para el badge de Anuncios). */
  hasNews: boolean
  /** Comprobación manual en curso. */
  checking: boolean
  error: string | null
  updater: UpdaterState
}

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? ''
  } catch {
    return ''
  }
}

let snapshot: UpdatesSnapshot = {
  currentVersion: __APP_VERSION__,
  latest: null,
  updateAvailable: false,
  hasNews: false,
  checking: false,
  error: null,
  updater: { status: 'idle' }
}

const listeners = new Set<() => void>()

function set(patch: Partial<UpdatesSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}

export function subscribeUpdates(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getUpdatesSnapshot(): UpdatesSnapshot {
  return snapshot
}

/** Hook de React para leer el store. */
export function useUpdates(): UpdatesSnapshot {
  return useSyncExternalStore(subscribeUpdates, getUpdatesSnapshot, getUpdatesSnapshot)
}

function computeDerived(latest: ReleaseInfo | null): Pick<UpdatesSnapshot, 'updateAvailable' | 'hasNews'> {
  if (!latest) return { updateAvailable: false, hasNews: false }
  const updateAvailable = isNewerVersion(latest.version, snapshot.currentVersion)
  return { updateAvailable, hasNews: updateAvailable && readSeen() !== latest.version }
}

/** Aplica una release conocida (lectura puntual o evento de Realtime). */
export function applyRelease(release: ReleaseInfo | null, updateAvailable?: boolean): void {
  const derived =
    updateAvailable === undefined
      ? computeDerived(release)
      : { updateAvailable, hasNews: updateAvailable && (!release || readSeen() !== release.version) }
  set({ latest: release, ...derived })
}

/** Aplica el estado del instalador. */
export function applyUpdaterState(state: UpdaterState): void {
  set({ updater: state })
}

/** Marca la versión más nueva como vista (quita el badge de Anuncios). */
export function markSeen(): void {
  const version = snapshot.latest?.version
  if (!version) return
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    /* sin storage: el badge se recalcula al reiniciar */
  }
  set({ hasNews: false })
}

/** Una lectura de la última release (Supabase; respaldo GitHub). */
export async function refreshLatest(): Promise<ReleaseInfo | null> {
  try {
    const result = await window.api.updates.getLatest()
    applyRelease(result.release ?? null, result.updateAvailable)
    if (!result.ok && result.error) set({ error: result.error })
    return result.release ?? null
  } catch (error) {
    set({ error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

/** Abre la página de la release en el navegador del sistema. */
export function openReleasePage(release: ReleaseInfo | null = snapshot.latest): void {
  if (release?.htmlUrl) window.open(release.htmlUrl, '_blank')
}

/** Aviso (una vez por versión) de que hay una actualización. */
export function notifyAvailable(release?: ReleaseInfo): void {
  const target = release ?? snapshot.latest
  if (!target) return
  const key = 'updates:notified-version'
  try {
    if (localStorage.getItem(key) === target.version) return
    localStorage.setItem(key, target.version)
  } catch {
    /* sin storage: se permite repetir */
  }
  notify({
    title: 'Actualización disponible',
    message: `Scrakk Studio v${target.version}`,
    severity: 'info',
    timeoutMs: 0,
    actions:
      snapshot.updater.status === 'unsupported'
        ? [{ label: 'Ver release', run: () => openReleasePage(target) }]
        : [
            { label: 'Actualizar', run: () => void downloadUpdate() },
            { label: 'Ver release', run: () => openReleasePage(target) }
          ]
  })
}

/** Lee el estado del instalador (sin disparar una comprobación). */
export async function syncUpdaterState(): Promise<void> {
  try {
    applyUpdaterState(await window.api.updates.updaterState())
  } catch {
    /* el estado queda como estaba */
  }
}

/** Descarga la actualización (avisa el resultado). */
export async function downloadUpdate(): Promise<UpdaterState> {
  const state = await window.api.updates.updaterDownload()
  applyUpdaterState(state)
  if (state.status === 'unsupported') {
    notify({
      title: 'Actualización disponible',
      message: state.error ?? 'Esta instalación no se actualiza sola.',
      severity: 'warn',
      timeoutMs: 0,
      actions: [{ label: 'Ver release', run: () => openReleasePage() }]
    })
  } else if (state.status === 'error') {
    notify({ title: 'No se pudo descargar', message: state.error, severity: 'error' })
  }
  return state
}

/** Instala y reinicia la app. */
export async function installUpdate(): Promise<void> {
  await window.api.updates.updaterInstall()
}

/** Aviso de que la actualización ya está descargada. */
export function notifyDownloaded(state: UpdaterState): void {
  notify({
    title: 'Actualización lista',
    message: state.version ? `v${state.version} — reinicia para aplicarla` : 'Reinicia para aplicarla',
    severity: 'success',
    timeoutMs: 0,
    actions: [{ label: 'Reiniciar y actualizar', run: () => void installUpdate() }]
  })
}
