/**
 * Actualizaciones del IDE — cliente de GitHub Releases (proceso main).
 *
 * Consulta `repos/{repo}/releases/latest` con fetch nativo de Node y
 * devuelve el payload comparado contra __APP_VERSION__.
 * Modular: la función pura `mapRelease`/comparación vive en shared/version;
 * acá solo está el I/O + registro IPC.
 */

import { ipcMain } from 'electron'
import {
  UPDATES_IPC,
  DEFAULT_UPDATES_REPO,
  type CheckLatestRequest,
  type GitHubReleaseInfo,
  type UpdateCheckResponse
} from '@shared/updates'
import { isNewerVersion } from '@shared/version'

declare const __APP_VERSION__: string

interface RawRelease {
  tag_name?: string
  name?: string
  html_url?: string
  published_at?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
}

/** Mapea el JSON crudo de GitHub al contrato compartido (puro, testeable). */
export function mapRelease(raw: RawRelease | null): GitHubReleaseInfo | null {
  if (!raw?.tag_name) return null
  return {
    tagName: raw.tag_name,
    name: raw.name,
    htmlUrl: raw.html_url,
    publishedAt: raw.published_at,
    body: raw.body
  }
}

export async function fetchLatestRelease(
  repo: string
): Promise<UpdateCheckResponse> {
  const currentVersion = __APP_VERSION__
  const cleanRepo = /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : DEFAULT_UPDATES_REPO

  try {
    const response = await fetch(`https://api.github.com/repos/${cleanRepo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!response.ok) {
      return {
        ok: false,
        currentVersion,
        updateAvailable: false,
        error: `GitHub API ${response.status}`
      }
    }

    const release = mapRelease((await response.json()) as RawRelease)
    if (!release) {
      return { ok: false, currentVersion, updateAvailable: false, error: 'release sin tag' }
    }

    const latestVersion = release.tagName
    const updateAvailable = isNewerVersion(latestVersion, currentVersion)

    return { ok: true, currentVersion, latestVersion, updateAvailable, release }
  } catch (error) {
    return {
      ok: false,
      currentVersion,
      updateAvailable: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function registerUpdatesIpc(): void {
  ipcMain.handle(
    UPDATES_IPC.checkLatest,
    (_event, request: CheckLatestRequest | undefined) =>
      fetchLatestRelease(request?.repo ?? DEFAULT_UPDATES_REPO)
  )
}
