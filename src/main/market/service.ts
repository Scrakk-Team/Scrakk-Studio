// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Servicio de la tienda de extensiones (proceso main).
 *
 * No hosteamos `.sef`: guardamos metadata y resolvemos la última release del
 * repo (GitHub/GitLab) al instalar / refrescar. Lecturas públicas con cliente
 * anónimo; escrituras con el cliente de la cuenta (RLS).
 */

import { app } from 'electron'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../account/config'
import { getClientFor } from '../supabaseClient'
import { installSefFromBuffer } from '../ipc/extensions'
import { sniffMime, uploadToR2 } from '../images/r2'
import { resolveLatestRelease } from './releases'
import {
  MARKET_MAX_SCREENSHOTS,
  type MarketExtension,
  type MarketImageUpload,
  type MarketRateRequest,
  type MarketRating,
  type MarketReportRequest,
  type MarketResult,
  type MarketRelease,
  type MarketSearchRequest,
  type MarketUpsertRequest,
  type RepoProvider
} from '@shared/market'

import { t } from '@shared/i18n'
type Row = Record<string, unknown>

const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const ok = <T>(data: T): MarketResult<T> => ({ ok: true, data })
const fail = <T>(error: string): MarketResult<T> => ({ ok: false, error })

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0) || 0
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function extensionsRoot(): string {
  return path.join(app.getPath('userData'), 'extensions')
}

function toExtension(row: Row, owner?: Row): MarketExtension {
  return {
    id: String(row.id),
    slug: String(row.slug),
    owner: String(row.owner),
    ownerName: owner ? str(owner.display_name) ?? str(owner.handle) : null,
    ownerHandle: owner ? str(owner.handle) : null,
    ownerVerified: owner ? owner.verified === true : false,
    name: String(row.name ?? ''),
    summary: str(row.summary),
    description: str(row.description),
    iconUrl: str(row.icon_url),
    screenshots: Array.isArray(row.screenshots) ? (row.screenshots as string[]) : [],
    videoUrl: str(row.video_url),
    repoProvider: (row.repo_provider === 'gitlab' ? 'gitlab' : 'github') as RepoProvider,
    repoUrl: String(row.repo_url ?? ''),
    assetName: str(row.asset_name),
    categories: Array.isArray(row.categories) ? (row.categories as string[]) : [],
    license: str(row.license),
    status: (row.status as MarketExtension['status']) ?? 'pending',
    verified: row.verified === true,
    verifiedAt: str(row.verified_at),
    downloads: num(row.downloads),
    ratingAvg: num(row.rating_avg),
    ratingCount: num(row.rating_count),
    latestVersion: str(row.latest_version),
    latestReleaseAt: str(row.latest_release_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? '')
  }
}

/** Rellena owner_name/handle/verified en lote (evita el embedding de PostgREST). */
async function enrichOwners(client: SupabaseClient, rows: Row[]): Promise<MarketExtension[]> {
  const ids = [...new Set(rows.map((r) => String(r.owner)))]
  const owners = new Map<string, Row>()
  if (ids.length > 0) {
    const { data } = await client.from('profiles').select('id,display_name,handle,verified').in('id', ids)
    for (const p of (data ?? []) as Row[]) owners.set(String(p.id), p)
  }
  return rows.map((r) => toExtension(r, owners.get(String(r.owner))))
}

export async function search(req: MarketSearchRequest): Promise<MarketExtension[]> {
  const { data, error } = await anon.rpc('search_extensions', {
    p_query: req.query ?? null,
    p_category: req.category ?? null,
    p_limit: req.limit ?? 40,
    p_offset: req.offset ?? 0
  })
  // Sin esto, un fallo del RPC se veía como "no hay extensiones" y nada más.
  if (error) console.warn(`[market] search_extensions falló: ${error.message}`)
  return enrichOwners(anon, (data ?? []) as Row[])
}

export async function categories(): Promise<string[]> {
  const { data, error } = await anon.rpc('extension_categories')
  if (error) console.warn(`[market] extension_categories falló: ${error.message}`)
  return ((data ?? []) as unknown[]).filter((c): c is string => typeof c === 'string')
}

export async function get(slug: string): Promise<MarketExtension | null> {
  const { data } = await anon.from('extensions').select('*').eq('slug', slug).maybeSingle()
  if (!data) return null
  return (await enrichOwners(anon, [data as Row]))[0] ?? null
}

export async function mine(accountId: string): Promise<MarketExtension[]> {
  const client = await getClientFor(accountId)
  if (!client) return []
  const { data } = await client
    .from('extensions')
    .select('*')
    .eq('owner', accountId)
    .order('updated_at', { ascending: false })
  return enrichOwners(client, (data ?? []) as Row[])
}

export async function upsert(
  accountId: string,
  req: MarketUpsertRequest
): Promise<MarketResult<MarketExtension>> {
  const client = await getClientFor(accountId)
  if (!client) return fail(t('main.cuenta.no.encontrada'))
  const name = req.name.trim()
  if (!name) return fail(t('market.nombre.requerido'))
  if (!/^https?:\/\//i.test(req.repoUrl.trim())) return fail(t('market.repo.invalido'))

  const slug = req.id ? undefined : slugify(name)
  const payload: Row = {
    owner: accountId,
    name,
    summary: req.summary?.trim() || null,
    description: req.description?.trim() || null,
    icon_url: req.iconUrl?.trim() || null,
    screenshots: (req.screenshots ?? []).slice(0, MARKET_MAX_SCREENSHOTS),
    video_url: req.videoUrl?.trim() || null,
    repo_provider: req.repoProvider,
    repo_url: req.repoUrl.trim(),
    asset_name: req.assetName?.trim() || null,
    categories: (req.categories ?? []).map((c) => slugify(c)).filter(Boolean).slice(0, 8),
    license: req.license?.trim() || null,
    status: 'pending'
  }
  if (slug) payload.slug = slug

  const query = req.id
    ? client.from('extensions').update(payload).eq('id', req.id).select('*').maybeSingle()
    : client.from('extensions').insert(payload).select('*').maybeSingle()
  const { data, error } = await query
  if (error || !data) {
    const msg = error?.message ?? ''
    if (msg.includes('duplicate key') || msg.includes('extensions_slug_key')) {
      return fail(t('market.slug.tomado'))
    }
    return fail(msg || t('market.no.se.pudo.guardar'))
  }
  return ok((await enrichOwners(client, [data as Row]))[0])
}

export async function remove(accountId: string, slug: string): Promise<MarketResult<null>> {
  const client = await getClientFor(accountId)
  if (!client) return fail(t('main.cuenta.no.encontrada'))
  const { error } = await client.from('extensions').delete().eq('slug', slug).eq('owner', accountId)
  return error ? fail(error.message) : ok(null)
}

export async function rate(accountId: string, req: MarketRateRequest): Promise<MarketResult<null>> {
  const client = await getClientFor(accountId)
  if (!client) return fail(t('main.cuenta.no.encontrada'))
  const stars = Math.max(1, Math.min(5, Math.round(req.stars)))
  const { data: ext } = await anon.from('extensions').select('id,owner').eq('slug', req.slug).maybeSingle()
  if (!ext) return fail(t('market.no.existe'))
  if ((ext as Row).owner === accountId) return fail(t('market.no.puedes.ratear.la'))
  const { error } = await client.from('extension_ratings').upsert(
    {
      extension_id: (ext as Row).id,
      user_id: accountId,
      stars,
      comment: req.comment?.trim() || null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'extension_id,user_id' }
  )
  return error ? fail(error.message) : ok(null)
}

export async function ratings(accountId: string | null, slug: string): Promise<MarketRating[]> {
  const { data: ext } = await anon.from('extensions').select('id').eq('slug', slug).maybeSingle()
  if (!ext) return []
  const { data } = await anon
    .from('extension_ratings')
    .select('*')
    .eq('extension_id', (ext as Row).id)
    .order('created_at', { ascending: false })
  const rows = (data ?? []) as Row[]
  const ids = [...new Set(rows.map((r) => String(r.user_id)))]
  const users = new Map<string, Row>()
  if (ids.length > 0) {
    const { data: profiles } = await anon
      .from('profiles')
      .select('id,display_name,handle,avatar_url')
      .in('id', ids)
    for (const p of (profiles ?? []) as Row[]) users.set(String(p.id), p)
  }
  return rows.map((r) => {
    const u = users.get(String(r.user_id))
    return {
      id: String(r.id),
      extensionId: String(r.extension_id),
      userId: String(r.user_id),
      userName: u ? str(u.display_name) ?? str(u.handle) : null,
      userHandle: u ? str(u.handle) : null,
      userAvatar: u ? str(u.avatar_url) : null,
      stars: num(r.stars),
      comment: str(r.comment),
      createdAt: String(r.created_at ?? ''),
      isMine: accountId !== null && String(r.user_id) === accountId
    }
  })
}

export async function report(accountId: string, req: MarketReportRequest): Promise<MarketResult<null>> {
  const client = await getClientFor(accountId)
  if (!client) return fail(t('main.cuenta.no.encontrada'))
  const { data: ext } = await anon.from('extensions').select('id').eq('slug', req.slug).maybeSingle()
  if (!ext) return fail(t('market.no.existe'))
  const { error } = await client.from('extension_reports').insert({
    extension_id: (ext as Row).id,
    user_id: accountId,
    reason: req.reason.trim().slice(0, 200),
    note: req.note?.trim().slice(0, 1000) || null
  })
  return error ? fail(error.message) : ok(null)
}

/** Sube una imagen (icono/screenshot) y devuelve su URL pública. */
export async function uploadImage(
  accountId: string,
  image: MarketImageUpload
): Promise<MarketResult<string>> {
  const client = await getClientFor(accountId)
  if (!client) return fail(t('main.cuenta.no.encontrada'))
  let bytes: Buffer
  try {
    bytes = Buffer.from(image.base64, 'base64')
  } catch {
    return fail(t('main.imagen.invalida'))
  }
  if (bytes.length === 0) return fail(t('main.imagen.vacia'))
  if (bytes.length > 2_000_000) return fail(t('market.imagen.grande'))
  const sniffed = sniffMime(bytes)
  if (sniffed === null) return fail(t('main.el.archivo.no.es.una'))
  const up = await uploadToR2(image.base64, sniffed, 'chat', image.name ?? 'extension')
  if (!up.ok) return fail(up.error)
  return ok(up.url)
}

export async function resolveRelease(input: {
  repoProvider: RepoProvider
  repoUrl: string
  assetName?: string | null
}): Promise<MarketResult<MarketRelease>> {
  const rel = await resolveLatestRelease(input.repoProvider, input.repoUrl, input.assetName ?? null)
  if (!rel) return fail(t('market.no.se.pudo.leer.la'))
  return ok(rel)
}

/** Instala (o actualiza) una extensión bajando el asset de su última release. */
export async function install(
  _accountId: string | null,
  slug: string
): Promise<MarketResult<{ id: string; name: string; version: string }>> {
  const ext = await get(slug)
  if (!ext) return fail(t('market.no.existe'))
  const rel = await resolveLatestRelease(ext.repoProvider, ext.repoUrl, ext.assetName)
  if (!rel?.assetUrl) return fail(t('market.sin.asset'))

  let bytes: Uint8Array
  try {
    const res = await fetch(rel.assetUrl, { redirect: 'follow' })
    if (!res.ok) return fail(`download ${res.status}`)
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }

  const installed = await installSefFromBuffer(bytes)
  if (!installed.success) return fail(installed.error)

  // Sidecar para auto-update (slug ↔ extensión instalada).
  try {
    await fs.writeFile(
      path.join(extensionsRoot(), installed.extension.id, '.market.json'),
      JSON.stringify({
        slug,
        version: rel.version,
        repoProvider: ext.repoProvider,
        repoUrl: ext.repoUrl,
        assetName: ext.assetName
      })
    )
  } catch {
    /* el sidecar es opcional */
  }
  await anon.rpc('increment_extension_download', { p_slug: slug }).then(
    () => undefined,
    () => undefined
  )
  return ok({ id: installed.extension.id, name: installed.extension.name, version: rel.version })
}

/**
 * Job: auto-update de las extensiones instaladas desde la tienda. Lee el
 * `.market.json` de cada una, resuelve la última release y, si cambió, la
 * reinstala. Devuelve cuántas actualizó.
 */
export async function checkInstalledUpdates(): Promise<number> {
  const root = extensionsRoot()
  let dirs: string[]
  try {
    dirs = await fs.readdir(root)
  } catch {
    return 0
  }
  let updated = 0
  for (const id of dirs) {
    let sidecar: {
      slug?: string
      version?: string
      repoProvider?: string
      repoUrl?: string
      assetName?: string | null
    }
    try {
      sidecar = JSON.parse(await fs.readFile(path.join(root, id, '.market.json'), 'utf-8')) as typeof sidecar
    } catch {
      continue
    }
    if (!sidecar.slug || !sidecar.repoUrl) continue
    const rel = await resolveLatestRelease(
      (sidecar.repoProvider === 'gitlab' ? 'gitlab' : 'github') as RepoProvider,
      sidecar.repoUrl,
      sidecar.assetName ?? null
    )
    if (!rel?.assetUrl || rel.version === sidecar.version) continue
    try {
      const res = await fetch(rel.assetUrl, { redirect: 'follow' })
      if (!res.ok) continue
      const bytes = new Uint8Array(await res.arrayBuffer())
      const installed = await installSefFromBuffer(bytes)
      if (!installed.success) continue
      await fs.writeFile(
        path.join(root, installed.extension.id, '.market.json'),
        JSON.stringify({ ...sidecar, version: rel.version })
      )
      updated += 1
    } catch {
      /* se reintenta en el próximo arranque */
    }
  }
  return updated
}

/** Job: refresca la última release de las extensiones del usuario (cache). */
export async function refresh(accountId: string): Promise<number> {
  const client = await getClientFor(accountId)
  if (!client) return 0
  const { data } = await client
    .from('extensions')
    .select('id,repo_provider,repo_url,asset_name')
    .eq('owner', accountId)
  let updated = 0
  for (const row of (data ?? []) as Row[]) {
    const rel = await resolveLatestRelease(
      (row.repo_provider === 'gitlab' ? 'gitlab' : 'github') as RepoProvider,
      String(row.repo_url),
      str(row.asset_name)
    )
    if (!rel) continue
    await client
      .from('extensions')
      .update({
        latest_version: rel.version,
        latest_release_at: rel.publishedAt,
        latest_checked_at: new Date().toISOString()
      })
      .eq('id', row.id)
    await client.from('extension_releases').upsert(
      {
        extension_id: row.id,
        version: rel.version,
        asset_name: rel.assetName,
        asset_url: rel.assetUrl,
        html_url: rel.htmlUrl,
        changelog: rel.changelog,
        published_at: rel.publishedAt
      },
      { onConflict: 'extension_id,version' }
    )
    updated += 1
  }
  return updated
}
