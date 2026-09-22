/**
 * Actualizaciones del IDE — releases.
 *
 *  1. **Supabase (Realtime)**: la tabla `public.releases` (migración 0019)
 *     recibe una fila por versión desde `release.yml`. El IDE se suscribe con
 *     un cliente ANÓNIMO (no hace falta cuenta) y recibe el INSERT empujado
 *     por WebSocket: nada de polling.
 *  2. **GitHub API**: comprobación puntual de respaldo (`checkLatest`), para
 *     el botón manual o si Supabase no responde.
 *
 * Al arrancar se hace UNA lectura (`getLatest`); el resto llega por Realtime.
 */

import { ipcMain } from 'electron'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  UPDATES_IPC,
  DEFAULT_UPDATES_REPO,
  type CheckLatestRequest,
  type ReleaseInfo,
  type UpdateCheckResponse
} from '@shared/updates'
import { isNewerVersion } from '@shared/version'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './account/config'
import { broadcast } from './broadcast'
import { initAutoUpdater, registerUpdaterIpc } from './auto-updater'

declare const __APP_VERSION__: string

/** Repo del proyecto (se puede overridear por entorno en tests/self-host). */
const UPDATE_REPO = process.env.SCRAKK_UPDATES_REPO ?? DEFAULT_UPDATES_REPO

// ── Mapeo de filas ─────────────────────────────────────────────────────────

/** Fila cruda de `public.releases`. */
interface SupabaseReleaseRow {
  tag?: string
  version?: string
  name?: string | null
  body?: string | null
  html_url?: string | null
  published_at?: string | null
  prerelease?: boolean | null
}

/** Fila de Supabase → contrato compartido (puro, testeable). */
export function rowToRelease(row: SupabaseReleaseRow | null): ReleaseInfo | null {
  if (!row?.version || !row.tag) return null
  return {
    tag: row.tag,
    version: row.version,
    name: row.name ?? undefined,
    body: row.body ?? undefined,
    htmlUrl: row.html_url ?? undefined,
    publishedAt: row.published_at ?? undefined,
    prerelease: row.prerelease ?? false
  }
}

interface RawRelease {
  tag_name?: string
  name?: string
  html_url?: string
  published_at?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
}

/** JSON crudo de GitHub → contrato compartido (puro, testeable). */
export function mapRelease(raw: RawRelease | null): ReleaseInfo | null {
  if (!raw?.tag_name) return null
  const version = raw.tag_name.replace(/^v/, '')
  return {
    tag: raw.tag_name,
    version,
    name: raw.name,
    htmlUrl: raw.html_url,
    publishedAt: raw.published_at,
    body: raw.body,
    prerelease: raw.prerelease ?? false
  }
}

function toResponse(release: ReleaseInfo | null): UpdateCheckResponse {
  const currentVersion = __APP_VERSION__
  if (!release) {
    return { ok: false, currentVersion, updateAvailable: false, error: 'sin release' }
  }
  return {
    ok: true,
    currentVersion,
    latestVersion: release.version,
    updateAvailable: isNewerVersion(release.version, currentVersion),
    release
  }
}

// ── Lectura puntual ────────────────────────────────────────────────────────

/** Última fila de `releases` en Supabase (una sola consulta). */
async function fetchLatestFromSupabase(): Promise<ReleaseInfo | null> {
  const url =
    `${SUPABASE_URL}/rest/v1/releases` +
    '?select=tag,version,name,body,html_url,published_at,prerelease' +
    '&order=published_at.desc&limit=1'
  try {
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        Accept: 'application/json'
      }
    })
    if (!response.ok) return null
    const rows = (await response.json()) as SupabaseReleaseRow[]
    return rowToRelease(rows[0] ?? null)
  } catch {
    return null
  }
}

/** Última release vía GitHub API (respaldo / botón manual). */
export async function fetchLatestRelease(repo: string = UPDATE_REPO): Promise<UpdateCheckResponse> {
  const currentVersion = __APP_VERSION__
  const cleanRepo = /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : UPDATE_REPO
  try {
    const response = await fetch(`https://api.github.com/repos/${cleanRepo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!response.ok) {
      return { ok: false, currentVersion, updateAvailable: false, error: `GitHub API ${response.status}` }
    }
    const release = mapRelease((await response.json()) as RawRelease)
    if (!release) {
      return { ok: false, currentVersion, updateAvailable: false, error: 'release sin tag' }
    }
    return toResponse(release)
  } catch (error) {
    return {
      ok: false,
      currentVersion,
      updateAvailable: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Última release conocida: Supabase primero (es la que alimenta el aviso en
 * vivo), GitHub como respaldo. Una sola lectura, sin bucle.
 */
export async function getLatest(): Promise<UpdateCheckResponse> {
  const fromSupabase = await fetchLatestFromSupabase()
  if (fromSupabase) return toResponse(fromSupabase)
  return fetchLatestRelease()
}

// ── Realtime (aviso en vivo) ───────────────────────────────────────────────

let realtimeClient: SupabaseClient | null = null
let realtimeStarted = false

/** Arranca la suscripción a INSERTs de `releases` (idempotente). */
export function startReleasesRealtime(): void {
  if (realtimeStarted) return
  realtimeStarted = true

  try {
    realtimeClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
    realtimeClient
      .channel('ide:releases')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'releases' },
        (payload) => {
          const release = rowToRelease(payload.new as SupabaseReleaseRow)
          if (!release) return
          // Solo molesta si es más nueva que la versión que corre el IDE.
          if (!isNewerVersion(release.version, __APP_VERSION__)) return
          broadcast(UPDATES_IPC.onRelease, release)
        }
      )
      .subscribe()
  } catch {
    // Sin Realtime queda la lectura puntual (getLatest) y el botón manual.
    realtimeClient = null
  }
}

/** Corta la suscripción (al cerrar la app). */
export function stopReleasesRealtime(): void {
  if (realtimeClient) {
    void realtimeClient.removeAllChannels()
    realtimeClient = null
  }
  realtimeStarted = false
}

// ── IPC ────────────────────────────────────────────────────────────────────

export function registerUpdatesIpc(): void {
  ipcMain.handle(UPDATES_IPC.getLatest, () => getLatest())
  ipcMain.handle(UPDATES_IPC.checkLatest, (_event, request: CheckLatestRequest | undefined) =>
    fetchLatestRelease(request?.repo ?? UPDATE_REPO)
  )
  registerUpdaterIpc()
  initAutoUpdater()
  startReleasesRealtime()
}
