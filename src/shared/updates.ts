// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Contrato de actualizaciones del IDE.
 *
 * Dos capas independientes:
 *
 *  1. **Aviso en vivo** (`getLatest` / `onRelease`): la release se registra en
 *     Supabase desde el workflow y el IDE la recibe por Realtime (WebSocket).
 *     Sin polling: una sola lectura al arrancar y el resto llega empujado.
 *
 *  2. **Instalación** (`updater*`): `electron-updater` (provider GitHub)
 *     descarga el artefacto y reinicia la app con `quitAndInstall()`.
 *
 * `checkLatest` (GitHub API) queda como comprobación puntual de respaldo.
 */

export const UPDATES_IPC = {
  /** Última release conocida (Supabase; si falla, GitHub API). */
  getLatest: 'updates:get-latest',
  /** Comprobación puntual contra GitHub Releases. */
  checkLatest: 'updates:check-latest',
  /** main → renderer: release nueva detectada en vivo. */
  onRelease: 'updates:on-release',
  /** main → renderer: estado del updater. */
  onUpdaterState: 'updates:on-updater-state',
  /** Estado actual del updater (sin disparar una comprobación). */
  updaterStateGet: 'updates:updater-state',
  /** Dispara una comprobación de actualización (updater). */
  updaterCheck: 'updates:updater-check',
  /** Descarga la actualización disponible. */
  updaterDownload: 'updates:updater-download',
  /** Instala y reinicia (`quitAndInstall`). */
  updaterInstall: 'updates:updater-install'
} as const

/** Repo del proyecto (overrideable con `SCRAKK_UPDATES_REPO`). */
export const DEFAULT_UPDATES_REPO = 'Scrakk/Scrakk-Studio'

/** Una release publicada. */
export interface ReleaseInfo {
  tag: string
  version: string
  name?: string
  /** Notas en markdown (el `changelog-<x.y.z>.md` de esa versión). */
  body?: string
  htmlUrl?: string
  publishedAt?: string
  prerelease?: boolean
}

export interface CheckLatestRequest {
  /** 'owner/repo'. Vacío → default. */
  repo?: string
}

export interface UpdateCheckResponse {
  ok: boolean
  currentVersion: string
  latestVersion?: string
  updateAvailable: boolean
  release?: ReleaseInfo
  error?: string
}

/**
 * Estado del instalador.
 *
 * `unsupported` = no se puede auto-actualizar (dev, o Linux sin AppImage);
 * en ese caso queda el aviso con enlace a la release.
 */
export type UpdaterStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdaterState {
  status: UpdaterStatus
  /** Versión que ofrece el updater. */
  version?: string
  /** 0-100 durante la descarga. */
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  error?: string
}

export interface UpdatesApi {
  /** Última release conocida (una sola lectura; no es polling). */
  getLatest(): Promise<UpdateCheckResponse>
  /** Comprobación puntual contra GitHub Releases. */
  checkLatest(repo?: string): Promise<UpdateCheckResponse>
  /** Estado actual del updater (sin comprobar). */
  updaterState(): Promise<UpdaterState>
  /** Comprueba actualización con electron-updater. */
  updaterCheck(): Promise<UpdaterState>
  /** Descarga la actualización disponible. */
  updaterDownload(): Promise<UpdaterState>
  /** Instala y reinicia la app. */
  updaterInstall(): Promise<void>
  /** Suscripción a releases nuevas detectadas en vivo. */
  onRelease(listener: (release: ReleaseInfo) => void): () => void
  /** Suscripción al estado del updater. */
  onUpdaterState(listener: (state: UpdaterState) => void): () => void
}
