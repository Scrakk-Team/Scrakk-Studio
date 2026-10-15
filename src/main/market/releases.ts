// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Resolver de releases (GitHub / GitLab) para la tienda.
 *
 * Dada la URL del repo, busca la release y el asset `.sef` (o el `assetName`
 * exacto). Solo se aceptan hosts github.com / gitlab.com (anti-SSRF).
 *
 * Un repo puede alojar VARIAS extensiones (es el caso del catálogo oficial):
 * ahí la "última release" del repo puede ser la de otra extensión, así que
 * cuando la fila fija un `assetName` se busca la release más nueva que traiga
 * ESE asset. Y el tag se etiqueta por extensión (`<id>@<version>`), así que la
 * versión se saca del sufijo del tag.
 *
 * Tokens opcionales por entorno para evitar el rate limit:
 *   SCRAKK_GITHUB_TOKEN, SCRAKK_GITLAB_TOKEN
 */

import type { RepoProvider } from '@shared/market'

export interface ResolvedRelease {
  version: string
  assetName: string | null
  assetUrl: string | null
  htmlUrl: string | null
  changelog: string | null
  publishedAt: string | null
}

const TIMEOUT_MS = 15_000

function stripV(tag: string | null | undefined): string {
  return (tag ?? '').trim().replace(/^v/i, '')
}

/**
 * Versión de una release a partir del tag (y del nombre, como respaldo).
 *
 * Los repos de una sola extensión etiquetan `v1.2.0`; el catálogo oficial
 * etiqueta por extensión: `halloween-themes@1.3.0` (o, si alguien usa guiones,
 * `canvas-v1.0.0`). La tienda muestra y compara VERSIONES, no tags.
 */
export function releaseVersion(
  tag: string | null | undefined,
  fallbackName?: string | null
): string {
  const raw = (tag ?? '').trim() || (fallbackName ?? '').trim()
  if (!raw) return '0.0.0'
  const at = raw.lastIndexOf('@')
  if (at > 0) return stripV(raw.slice(at + 1)) || '0.0.0'
  const dashed = raw.lastIndexOf('-v')
  if (dashed > 0) return raw.slice(dashed + 2)
  return stripV(raw) || '0.0.0'
}

/**
 * La release MÁS NUEVA (las APIs la devuelven de nueva a vieja) que cumple el
 * predicado — en la práctica: la que trae el asset de esa extensión.
 *
 * Es lo que permite un repo con varias extensiones: cada fila de la tienda fija
 * su `assetName` y se queda con su release, sin importar cuál se publicó última.
 */
export function findReleaseWithAsset<T>(
  releases: T[],
  hasAsset: (release: T) => boolean
): T | null {
  return releases.find((release) => hasAsset(release)) ?? null
}

/** `owner/repo` de una URL de GitHub/GitLab (tolera `.git`, `/releases`, etc.). */
export function parseRepoPath(provider: RepoProvider, repoUrl: string): string | null {
  let url: URL
  try {
    url = new URL(repoUrl.trim())
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (provider === 'github' && host !== 'github.com' && host !== 'www.github.com') return null
  if (provider === 'gitlab' && host !== 'gitlab.com' && host !== 'www.gitlab.com') return null
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length < 2) return null
  const owner = segments[0]
  const repo = segments[1].replace(/\.git$/i, '')
  if (!owner || !repo) return null
  return `${owner}/${repo}`
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers, signal: controller.signal })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Elige el asset: el `assetName` exacto si viene; si no, el primero `.sef`. */
function pickAsset<T extends { name: string; url: string }>(
  assets: T[],
  assetName: string | null | undefined
): T | null {
  if (assetName) {
    const exact = assets.find((a) => a.name === assetName)
    if (exact) return exact
  }
  return assets.find((a) => a.name.toLowerCase().endsWith('.sef')) ?? null
}

interface GitHubRelease {
  tag_name?: string
  name?: string
  body?: string
  html_url?: string
  published_at?: string
  assets?: Array<{ name?: string; browser_download_url?: string }>
}

async function resolveGitHub(path: string, assetName?: string | null): Promise<ResolvedRelease | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Scrakk-Studio'
  }
  const token = process.env.SCRAKK_GITHUB_TOKEN?.trim()
  if (token) headers.Authorization = `Bearer ${token}`

  let data: GitHubRelease | null = null
  if (assetName) {
    // Repo con varias extensiones: la release de ESTA es la más nueva que trae
    // su asset (la "latest" del repo puede ser la de otra).
    const list = (await getJson(
      `https://api.github.com/repos/${path}/releases?per_page=30`,
      headers
    )) as GitHubRelease[] | null
    data = Array.isArray(list)
      ? findReleaseWithAsset(list, (release) =>
          (release.assets ?? []).some((asset) => asset.name === assetName)
        )
      : null
  }
  data ??= (await getJson(`https://api.github.com/repos/${path}/releases/latest`, headers)) as
    | GitHubRelease
    | null
  if (!data) return null
  const assets = (data.assets ?? [])
    .filter((a) => typeof a.name === 'string' && typeof a.browser_download_url === 'string')
    .map((a) => ({ name: a.name as string, url: a.browser_download_url as string }))
  const asset = pickAsset(assets, assetName)
  return {
    version: releaseVersion(data.tag_name, data.name),
    assetName: asset?.name ?? null,
    assetUrl: asset?.url ?? null,
    htmlUrl: data.html_url ?? null,
    changelog: data.body ?? null,
    publishedAt: data.published_at ?? null
  }
}

async function resolveGitLab(path: string, assetName?: string | null): Promise<ResolvedRelease | null> {
  const headers: Record<string, string> = { 'User-Agent': 'Scrakk-Studio' }
  const token = process.env.SCRAKK_GITLAB_TOKEN?.trim()
  if (token) headers['PRIVATE-TOKEN'] = token
  const project = encodeURIComponent(path)
  type GitLabRelease = {
    tag_name?: string
    name?: string
    description?: string
    released_at?: string
    _links?: { self?: string }
    assets?: { links?: Array<{ name?: string; url?: string; direct_asset_url?: string }> }
  }
  // Varias extensiones en un mismo proyecto: se busca la release con el asset.
  const query = assetName ? 'releases?per_page=30' : 'releases?per_page=1'
  const data = (await getJson(
    `https://gitlab.com/api/v4/projects/${project}/${query}`,
    headers
  )) as GitLabRelease[] | null
  const list = Array.isArray(data) ? data : []
  const release = assetName
    ? findReleaseWithAsset(list, (entry) =>
        (entry.assets?.links ?? []).some((link) => link.name === assetName)
      )
    : (list[0] ?? null)
  if (!release) return null
  const assets = (release.assets?.links ?? [])
    .filter((l) => typeof l.name === 'string')
    .map((l) => ({ name: l.name as string, url: (l.direct_asset_url ?? l.url ?? '') as string }))
  const asset = pickAsset(assets, assetName)
  return {
    version: releaseVersion(release.tag_name, release.name),
    assetName: asset?.name ?? null,
    assetUrl: asset?.url ?? null,
    htmlUrl: release._links?.self ?? null,
    changelog: release.description ?? null,
    publishedAt: release.released_at ?? null
  }
}

/** Última release del repo (o null si no se pudo resolver). */
export async function resolveLatestRelease(
  provider: RepoProvider,
  repoUrl: string,
  assetName?: string | null
): Promise<ResolvedRelease | null> {
  const path = parseRepoPath(provider, repoUrl)
  if (!path) return null
  return provider === 'github' ? resolveGitHub(path, assetName) : resolveGitLab(path, assetName)
}
