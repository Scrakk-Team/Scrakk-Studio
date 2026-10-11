// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tienda de extensiones — contrato compartido main ⇄ preload ⇄ renderer.
 *
 * La tienda es SOLO metadata: guarda el link del repo (GitHub/GitLab) y la app
 * resuelve la última release y baja el `.sef` desde ahí. No hosteamos código.
 */

export const MARKET_IPC = {
  search: 'market:search',
  categories: 'market:categories',
  get: 'market:get',
  mine: 'market:mine',
  upsert: 'market:upsert',
  remove: 'market:remove',
  rate: 'market:rate',
  ratings: 'market:ratings',
  report: 'market:report',
  uploadImage: 'market:upload-image',
  resolveRelease: 'market:resolve-release',
  install: 'market:install',
  refresh: 'market:refresh'
} as const

export type RepoProvider = 'github' | 'gitlab'
export type MarketStatus = 'draft' | 'pending' | 'published' | 'suspended'

export interface MarketExtension {
  id: string
  slug: string
  owner: string
  ownerName: string | null
  ownerHandle: string | null
  ownerVerified: boolean
  name: string
  summary: string | null
  description: string | null
  iconUrl: string | null
  screenshots: string[]
  videoUrl: string | null
  repoProvider: RepoProvider
  repoUrl: string
  assetName: string | null
  categories: string[]
  license: string | null
  status: MarketStatus
  verified: boolean
  verifiedAt: string | null
  downloads: number
  ratingAvg: number
  ratingCount: number
  latestVersion: string | null
  latestReleaseAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MarketRelease {
  version: string
  assetName: string | null
  assetUrl: string | null
  htmlUrl: string | null
  changelog: string | null
  publishedAt: string | null
}

export interface MarketRating {
  id: string
  extensionId: string
  userId: string
  userName: string | null
  userHandle: string | null
  userAvatar: string | null
  stars: number
  comment: string | null
  createdAt: string
  isMine: boolean
}

export interface MarketSearchRequest {
  query?: string
  category?: string | null
  limit?: number
  offset?: number
}

export interface MarketUpsertRequest {
  id?: string
  name: string
  summary?: string
  description?: string
  iconUrl?: string
  screenshots?: string[]
  videoUrl?: string
  repoProvider: RepoProvider
  repoUrl: string
  assetName?: string
  categories?: string[]
  license?: string
}

export interface MarketRateRequest {
  slug: string
  stars: number
  comment?: string
}

export interface MarketReportRequest {
  slug: string
  reason: string
  note?: string
}

/** Imagen de la tienda (icono o screenshot): base64 + mime, máx 3 screenshots. */
export interface MarketImageUpload {
  base64: string
  mime: string
  name?: string
}

export type MarketResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Máximo de screenshots por extensión (además del icono). */
export const MARKET_MAX_SCREENSHOTS = 3

/** API expuesta en `window.api.market`. */
export interface MarketApi {
  search: (req: MarketSearchRequest) => Promise<MarketExtension[]>
  categories: () => Promise<string[]>
  get: (slug: string) => Promise<MarketExtension | null>
  mine: (accountId: string) => Promise<MarketExtension[]>
  upsert: (accountId: string, req: MarketUpsertRequest) => Promise<MarketResult<MarketExtension>>
  remove: (accountId: string, slug: string) => Promise<MarketResult<null>>
  rate: (accountId: string, req: MarketRateRequest) => Promise<MarketResult<null>>
  ratings: (accountId: string | null, slug: string) => Promise<MarketRating[]>
  report: (accountId: string, req: MarketReportRequest) => Promise<MarketResult<null>>
  uploadImage: (accountId: string, image: MarketImageUpload) => Promise<MarketResult<string>>
  resolveRelease: (input: { repoProvider: RepoProvider; repoUrl: string; assetName?: string | null }) => Promise<MarketResult<MarketRelease>>
  install: (accountId: string | null, slug: string) => Promise<MarketResult<{ id: string; name: string; version: string }>>
  refresh: (accountId: string) => Promise<number>
}
