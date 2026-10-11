// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Resolver de releases (GitHub / GitLab) para la tienda.
 *
 * Dada la URL del repo, busca la ÚLTIMA release y el asset `.sef` (o el
 * `assetName` exacto). Solo se aceptan hosts github.com / gitlab.com (anti-SSRF).
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

async function resolveGitHub(path: string, assetName?: string | null): Promise<ResolvedRelease | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Scrakk-Studio'
  }
  const token = process.env.SCRAKK_GITHUB_TOKEN?.trim()
  if (token) headers.Authorization = `Bearer ${token}`
  const data = (await getJson(`https://api.github.com/repos/${path}/releases/latest`, headers)) as {
    tag_name?: string
    name?: string
    body?: string
    html_url?: string
    published_at?: string
    assets?: Array<{ name?: string; browser_download_url?: string }>
  } | null
  if (!data) return null
  const assets = (data.assets ?? [])
    .filter((a) => typeof a.name === 'string' && typeof a.browser_download_url === 'string')
    .map((a) => ({ name: a.name as string, url: a.browser_download_url as string }))
  const asset = pickAsset(assets, assetName)
  return {
    version: stripV(data.tag_name) || stripV(data.name) || '0.0.0',
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
  const data = (await getJson(
    `https://gitlab.com/api/v4/projects/${project}/releases?per_page=1`,
    headers
  )) as Array<{
    tag_name?: string
    name?: string
    description?: string
    released_at?: string
    _links?: { self?: string }
    assets?: { links?: Array<{ name?: string; url?: string; direct_asset_url?: string }> }
  }> | null
  const release = Array.isArray(data) ? data[0] : null
  if (!release) return null
  const assets = (release.assets?.links ?? [])
    .filter((l) => typeof l.name === 'string')
    .map((l) => ({ name: l.name as string, url: (l.direct_asset_url ?? l.url ?? '') as string }))
  const asset = pickAsset(assets, assetName)
  return {
    version: stripV(release.tag_name) || stripV(release.name) || '0.0.0',
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
