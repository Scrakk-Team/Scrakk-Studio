/**
 * Contrato de actualizaciones del IDE — conectado a GitHub Releases.
 *
 * Modelo scrakk-cli: el propio proyecto publica releases con tag semver;
 * el IDE consulta `repos/{owner}/{repo}/releases/latest` y compara contra
 * su versión compilada (__APP_VERSION__ desde package.json).
 */

export const UPDATES_IPC = {
  /** Consulta la última release del repo configurado y compara versiones. */
  checkLatest: 'updates:check-latest',
  /** Repo actualmente configurado (persistido vía storage del renderer). */
  getRepo: 'updates:get-repo'
} as const

/** Repo por defecto del proyecto — overrideable por settings (storage). */
export const DEFAULT_UPDATES_REPO = 'scrakk-studio/scrakk-studio'

export interface GitHubReleaseInfo {
  tagName: string
  name?: string
  htmlUrl?: string
  publishedAt?: string
  body?: string
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
  release?: GitHubReleaseInfo
  error?: string
}

export interface UpdatesApi {
  checkLatest(repo?: string): Promise<UpdateCheckResponse>
}
