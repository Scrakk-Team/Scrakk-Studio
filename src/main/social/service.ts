// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Servicio social (proceso main): amigos + mensajes directos, POR CUENTA.
 *
 * Cada llamada recibe el `accountId` (que es el `auth.users.id` de esa cuenta)
 * y usa el cliente Supabase de esa cuenta. Permite varias cuentas activas a la
 * vez (una por panel del layout). Realtime: un canal por cuenta.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { getClientFor, forgetClient } from '../supabaseClient'
import { IMAGE_RULES } from '@shared/social'
import { isR2Configured, sniffMime, uploadToR2 } from '../images/r2'
import {
  checkCodeFileContent,
  decodeCodeFile,
  type SocialCodeFile
} from '@shared/socialCodeFile'
import { codeFileSignedUrl, deleteCodeFileObject, uploadCodeFile } from './codeFiles'
import type {
  DirectMessage,
  Friend,
  FriendRequest,
  ImageUpload,
  MessageAttachment,
  PresenceActivity,
  PresenceStatus,
  SocialMessageKind,
  SocialResult,
  SocialUser,
  UploadedImage,
  UserPresence
} from '@shared/social'
import { SOCIAL_RULES } from '@shared/social'

import { t } from '@shared/i18n'
function ok<T>(data: T): SocialResult<T> {
  return { ok: true, data }
}
function fail<T>(error: string): SocialResult<T> {
  return { ok: false, error }
}

function cleanError(message: string | undefined): string {
  const m = (message ?? '').toLowerCase()
  if (m.includes('no_auth')) return t('main.necesitas.iniciar.sesion')
  if (m.includes('user_not_found')) return t('main.ese.usuario.no.existe')
  if (m.includes('invalid_target')) return t('main.destino.invalido')
  if (m.includes('request_not_found')) return t('main.la.solicitud.ya.no.existe')
  if (m.includes('rate_limited')) return t('main.tienes.demasiadas.solicitudes.pendientes.espera')
  return message ?? t('main.algo.salio.mal')
}

interface UserRow {
  id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  verified: boolean
  bio: string | null
  gender: string | null
  custom_status: string | null
  custom_status_expires_at: string | null
  created_at: string | null
}
interface FriendRow extends UserRow {
  since: string
}
interface RequestRow {
  id: string
  direction: string
  other_id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  verified: boolean
  created_at: string
}
interface MessageRow {
  id: string
  sender_id: string
  recipient_id: string
  kind: SocialMessageKind
  body: string
  created_at: string
  read_at: string | null
  reply_to: string | null
  edited_at: string | null
}

interface AttachmentRow {
  id: string
  message_id: string
  path: string
  url: string
  mime: string
  size_bytes: number
  width: number | null
  height: number | null
}

function mapAttachment(row: AttachmentRow): MessageAttachment {
  return {
    id: row.id,
    messageId: row.message_id,
    path: row.path,
    url: row.url,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height
  }
}

const ATTACH_SELECT = 'id,message_id,path,url,mime,size_bytes,width,height'

/** Adjuntos de un lote de mensajes (una sola query). */
async function hydrateAttachments(
  supabase: SupabaseClient,
  messageIds: string[]
): Promise<Map<string, MessageAttachment[]>> {
  const map = new Map<string, MessageAttachment[]>()
  if (messageIds.length === 0) return map
  const { data } = await supabase.from('message_attachments').select(ATTACH_SELECT).in('message_id', messageIds)
  for (const row of (data ?? []) as AttachmentRow[]) {
    const list = map.get(row.message_id) ?? []
    list.push(mapAttachment(row))
    map.set(row.message_id, list)
  }
  return map
}

function mapUser(row: UserRow): SocialUser {
  return {
    id: row.id,
    handle: row.handle ?? null,
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    verified: row.verified === true,
    bio: row.bio ?? null,
    gender: row.gender ?? null,
    customStatus: row.custom_status ?? null,
    customStatusExpiresAt: row.custom_status_expires_at ?? null,
    createdAt: row.created_at ?? null
  }
}
function mapMessage(row: MessageRow): DirectMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    kind: row.kind ?? 'normal',
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
    replyTo: row.reply_to ?? null,
    editedAt: row.edited_at ?? null
  }
}

async function clientOf(accountId: string): Promise<SupabaseClient | null> {
  return getClientFor(accountId)
}

export async function listFriends(accountId: string): Promise<SocialResult<Friend[]>> {
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const { data, error } = await supabase.rpc('list_friends')
  if (error) return fail(cleanError(error.message))
  return ok(((data ?? []) as FriendRow[]).map((row) => ({ ...mapUser(row), since: row.since })))
}

export async function searchUsers(
  accountId: string,
  query: string
): Promise<SocialResult<SocialUser[]>> {
  // Tolera el "@" inicial (el placeholder sugiere "@usuario").
  const q = query.trim().replace(/^@+/, '')
  if (q.length < SOCIAL_RULES.searchMin) return ok([])
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const { data, error } = await supabase.rpc('search_users', { q })
  if (error) return fail(cleanError(error.message))
  return ok(((data ?? []) as UserRow[]).map(mapUser))
}

export async function listRequests(accountId: string): Promise<SocialResult<FriendRequest[]>> {
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const { data, error } = await supabase.rpc('list_requests')
  if (error) return fail(cleanError(error.message))
  return ok(
    ((data ?? []) as RequestRow[]).map((row) => ({
      id: row.id,
      direction: row.direction === 'outgoing' ? 'outgoing' : 'incoming',
      otherId: row.other_id,
      handle: row.handle ?? null,
      displayName: row.display_name ?? null,
      avatarUrl: row.avatar_url ?? null,
      verified: row.verified === true,
      createdAt: row.created_at
    }))
  )
}

export async function sendRequest(accountId: string, targetId: string): Promise<SocialResult<string>> {
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const { data, error } = await supabase.rpc('send_friend_request', { target: targetId })
  if (error) return fail(cleanError(error.message))
  return ok(String(data ?? 'pending'))
}

export async function respondRequest(
  accountId: string,
  requestId: string,
  accept: boolean
): Promise<SocialResult<string>> {
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const { data, error } = await supabase.rpc('respond_friend_request', { req: requestId, accept })
  if (error) return fail(cleanError(error.message))
  return ok(String(data ?? (accept ? 'accepted' : 'rejected')))
}

export async function removeFriend(accountId: string, otherId: string): Promise<SocialResult<boolean>> {
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const { data, error } = await supabase.rpc('remove_friend', { other: otherId })
  if (error) return fail(cleanError(error.message))
  return ok(Boolean(data))
}

export async function listMessages(
  accountId: string,
  withUserId: string,
  beforeId?: string | null,
  limit = 50
): Promise<SocialResult<DirectMessage[]>> {
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const uid = accountId
  const pageSize = Math.min(Math.max(limit, 10), 100)
  let query = supabase
    .from('messages')
    .select('id,sender_id,recipient_id,kind,body,created_at,read_at,reply_to,edited_at')
    .or(
      `and(sender_id.eq.${uid},recipient_id.eq.${withUserId}),and(sender_id.eq.${withUserId},recipient_id.eq.${uid})`
    )
  if (beforeId) {
    const { data: before } = await supabase.from('messages').select('created_at').eq('id', beforeId).maybeSingle()
    if (before) query = query.lt('created_at', (before as { created_at: string }).created_at)
  }
  query = query.order('created_at', { ascending: false }).limit(pageSize)
  const { data, error } = await query
  if (error) return fail(cleanError(error.message))
  const rows = ((data ?? []) as MessageRow[]).reverse()
  // Hydrate reply previews
  const replyIds = [...new Set(rows.map((r) => r.reply_to).filter(Boolean) as string[])]
  let replyMap = new Map<string, MessageRow>()
  if (replyIds.length > 0) {
    const { data: replyData } = await supabase
      .from('messages')
      .select('id,sender_id,recipient_id,kind,body,created_at,read_at,reply_to,edited_at')
      .in('id', replyIds)
    for (const r of (replyData ?? []) as MessageRow[]) replyMap.set(r.id, r)
  }
  const attachMap = await hydrateAttachments(
    supabase,
    rows.map((r) => r.id)
  )
  return ok(
    rows.map((r) => ({
      ...mapMessage(r),
      attachments: attachMap.get(r.id) ?? [],
      replyPreview: r.reply_to && replyMap.get(r.reply_to)
        ? { id: replyMap.get(r.reply_to)!.id, body: replyMap.get(r.reply_to)!.body, senderId: replyMap.get(r.reply_to)!.sender_id }
        : null
    }))
  )
}

function extFor(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/avif') return 'avif'
  return 'bin'
}

function validateImage(image: ImageUpload): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  const allowed = IMAGE_RULES.allowedMime as readonly string[]
  if (!allowed.includes(image.mime)) return { ok: false, error: t('main.formato.no.soportado.png.jpg') }
  let bytes: Buffer
  try {
    bytes = Buffer.from(image.base64, 'base64')
  } catch {
    return { ok: false, error: t('main.imagen.invalida') }
  }
  if (bytes.length === 0 || bytes.length > IMAGE_RULES.maxBytes) {
    return { ok: false, error: t('main.la.imagen.supera.los.10') }
  }
  // El mime declarado tiene que coincidir con los bytes reales.
  const sniffed = sniffMime(bytes)
  if (sniffed === null) return { ok: false, error: t('main.el.archivo.no.es.una') }
  if (sniffed !== image.mime) return { ok: false, error: t('main.la.imagen.no.coincide.con') }
  return { ok: true, bytes }
}

/**
 * Sube una imagen: R2 si está configurado, si no Supabase Storage (fallback).
 * El renderer nunca ve el binario de vuelta: solo la URL pública.
 */
export async function uploadImage(
  accountId: string,
  kind: 'chat' | 'avatar',
  image: ImageUpload
): Promise<SocialResult<UploadedImage>> {
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const valid = validateImage(image)
  if (!valid.ok) return fail(valid.error)
  // Camino R2 (buckets scrakk-chat-images / scrakk-avatars).
  if (isR2Configured(kind)) {
    const up = await uploadToR2(image.base64, image.mime, kind, image.name)
    if (!up.ok) return fail(cleanError(up.error))
    return ok({ path: up.key, url: up.url, mime: image.mime, sizeBytes: valid.bytes.length })
  }
  // Fallback: Supabase Storage (buckets `avatars` / `chat-images`).
  const bucket = kind === 'avatar' ? 'avatars' : 'chat-images'
  const safeName = (image.name || 'img').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'img'
  const path = `${accountId}/${crypto.randomUUID()}-${safeName}.${extFor(image.mime)}`
  const { error } = await supabase.storage.from(bucket).upload(path, valid.bytes, {
    contentType: image.mime,
    upsert: false
  })
  if (error) return fail(cleanError(error.message))
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return ok({ path, url: data.publicUrl, mime: image.mime, sizeBytes: valid.bytes.length })
}

/**
 * ¿Este error es "no hay sesión" y no "no sos amigo"?
 *
 * `42501` (insufficient_privilege) es el código de CUALQUIER cosa: la RLS de
 * amistad, un token vencido, un claim raro… Con el mismo código la app报告显示
 * "solo puedes escribirle a tus amigos" incluso cuando la amistad existe y lo
 * que faltaba era el JWT. Estos son los mensajes que emite PostgREST/GoTrue.
 */
export function looksLikeMissingSession(message: string | undefined): boolean {
  const m = (message ?? '').toLowerCase()
  return (
    m.includes('jwt') ||
    m.includes('invalid claim') ||
    m.includes('missing claim') ||
    m.includes('token is expired') ||
    m.includes('no authorization') ||
    m.includes('auth session missing')
  )
}

/**
 * Traduce el error del INSERT a un mensaje honesto.
 *
 * Antes: cualquier 42501 → "solo puedes escribirle a tus amigos". Con 42501
 * siendo el código genérico de falta de permiso, eso convertía un token
 * vencido en un mensaje falso (y hacía pensar que se habían perdido los datos).
 */
export function describeSendError(
  message: string | undefined,
  code?: string
): string {
  const raw = message ?? ''
  const m = raw.toLowerCase()
  // El slowmode de la DB: el trigger levanta 'msg_ratelimited' (22023).
  if (m.includes('msg_ratelimited')) return 'msg_ratelimited'
  if (m.includes('reply_not_in_dm')) return t('main.no.puedes.citar.un.mensaje')
  if (m.includes('messages_immutable')) return t('main.el.mensaje.no.se.puede.modificar.asi')
  if (m.includes('not_sender')) return t('main.no.puedes.editar.ese.mensaje')
  if (looksLikeMissingSession(raw)) return t('main.necesitas.iniciar.sesion')
  // Fallo de INFRAESTRUCTURA (ACL/privilegios del servidor), no del usuario.
  //
  // Esto es lo que convirtió el bug de la migración 0022 en un falso "no sos
  // amigo" durante días: `permission denied for function is_codefile_body` es
  // un 42501 sin la palabra "policy", así que caía en el mensaje de permisos
  // DEL USUARIO y parecía que el usuario no podía escribirle a su amigo.
  if (m.includes('permission denied for function') || m.includes('permission denied for table')) {
    console.error('[social] error de privilegios en la DB (no es del usuario):', raw)
    return t('main.error.interno.del.servidor.reintenta')
  }
  // 42501 que SÍ viene de la RLS de amistad: el texto dice "policy".
  if (code === '42501') {
    if (m.includes('policy') || m.includes('row-level security')) {
      return t('main.solo.puedes.escribirle.a.tus')
    }
    console.error('[social] 42501 sin causa reconocida:', raw)
    return t('main.error.interno.del.servidor.reintenta')
  }
  return cleanError(raw)
}

/**
 * Texto efectivo del mensaje.
 *
 * Si mandás SÓLO adjuntos, el body va **vacío**: antes se rellenaba con `'📷'`
 * para pasar el CHECK `char_length(body) >= 1`, y ese emoji viajaba como data y
 * se pintaba arriba de la imagen (el usuario veía "foto + 📷").
 *
 * Devuelve `null` cuando no hay ni texto ni adjuntos: mensaje vacío, se rechaza.
 */
export function effectiveMessageBody(body: string, attachmentCount: number): string | null {
  const text = body.trim()
  if (!text && attachmentCount === 0) return null
  return text
}

export async function sendMessage(
  accountId: string,
  toUserId: string,
  body: string,
  replyTo: string | null = null,
  attachments: ImageUpload[] = []
): Promise<SocialResult<DirectMessage>> {
  // Si mandás una foto sin escribir nada, el body va VACÍO (ver `effectiveMessageBody`).
  const text = effectiveMessageBody(body, attachments.length)
  if (text === null) return fail(t('main.el.mensaje.esta.vacio'))
  if (text.length > SOCIAL_RULES.messageMax) return fail(t('main.mensaje.demasiado.largo'))
  if (attachments.length > 8) return fail(t('main.maximo.8.imagenes.por.mensaje'))
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.necesitas.iniciar.sesion'))
  // Validate reply_to belongs to same DM if provided
  if (replyTo) {
    const { data: parent, error: parentErr } = await supabase
      .from('messages')
      .select('id,sender_id,recipient_id')
      .eq('id', replyTo)
      .maybeSingle()
    if (parentErr || !parent) return fail(t('main.mensaje.citado.no.existe'))
    const p = parent as { sender_id: string; recipient_id: string }
    const isSameDm =
      (p.sender_id === accountId && p.recipient_id === toUserId) ||
      (p.sender_id === toUserId && p.recipient_id === accountId)
    if (!isSameDm) return fail(t('main.no.puedes.citar.un.mensaje'))
  }
  // 1) Subir imágenes ANTES de crear el mensaje: si falla, no queda huérfano.
  const uploads: Array<{ url: string; path: string; mime: string; sizeBytes: number; width: number | null; height: number | null }> = []
  for (const image of attachments.slice(0, 8)) {
    const up = await uploadImage(accountId, 'chat', image)
    if (!up.ok) return fail(`No se pudo subir la imagen: ${up.error ?? t('main.error.desconocido')}`)
    uploads.push({
      url: up.data.url,
      path: up.data.path,
      mime: up.data.mime,
      sizeBytes: up.data.sizeBytes,
      width: image.width ?? null,
      height: image.height ?? null
    })
  }
  // 2) Crear el mensaje.
  //
  // El INSERT va en un helper porque hay que poder reintentarlo: si la sesión
  // se perdió en vuelo (el cliente quedó sin JWT), la RLS responde 42501 y el
  // mensaje se perdía. Un reintento con el cliente rearmado lo resuelve sin que
  // el usuario tenga que volver a loguearse.
  let data: MessageRow | null = null
  let insertError: { code?: string; message?: string } | null = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ins = await supabase
      .from('messages')
      .insert({ sender_id: accountId, recipient_id: toUserId, body: text, reply_to: replyTo })
      .select('id,sender_id,recipient_id,kind,body,created_at,read_at,reply_to,edited_at')
      .single()
    if (!ins.error) {
      data = ins.data as MessageRow
      insertError = null
      break
    }
    insertError = ins.error
    // Reintento único y sólo si parece sesión: si no hay JWT, `auth.uid()` es
    // NULL y la política de amistad rechaza el INSERT con 42501.
    if (attempt === 0 && looksLikeMissingSession(ins.error.message)) {
      forgetClient(accountId)
      const rebuilt = await clientOf(accountId)
      if (!rebuilt) break
      continue
    }
    break
  }
  if (insertError || !data) {
    return fail(describeSendError(insertError?.message, insertError?.code))
  }
  const mapped = mapMessage(data)
  // Hydrate preview if reply
  if (mapped.replyTo) {
    const { data: parent } = await supabase
      .from('messages')
      .select('id,body,sender_id')
      .eq('id', mapped.replyTo)
      .maybeSingle()
    if (parent) (mapped as any).replyPreview = { id: (parent as any).id, body: (parent as any).body, senderId: (parent as any).sender_id }
  }
  // 3) Colgar adjuntos. Si esto falla, se borra el mensaje (sin huérfanos).
  let saved: MessageAttachment[] = []
  if (uploads.length > 0) {
    const rows: Omit<AttachmentRow, 'id'>[] = uploads.map((u) => ({
      message_id: mapped.id,
      path: u.path,
      url: u.url,
      mime: u.mime,
      size_bytes: u.sizeBytes,
      width: u.width,
      height: u.height
    }))
    const { data: inserted, error: attachErr } = await supabase.from('message_attachments').insert(rows).select(ATTACH_SELECT)
    if (attachErr || !inserted) {
      await supabase.from('messages').delete().eq('id', mapped.id).eq('sender_id', accountId)
      return fail(`No se pudo guardar la imagen: ${cleanError(attachErr?.message)}`)
    }
    saved = (inserted as AttachmentRow[]).map(mapAttachment)
  }
  return ok({ ...mapped, attachments: saved })
}

/**
 * Comparte un ARCHIVO (`kind = 'codefile'`): el contenido va a R2 vía la Edge
 * Function (gatekeeper), que además INSERTA el mensaje — así la cuota y el rate
 * limit de la DB aplican aunque el cliente esté modificado. Acá se revalida
 * rápido para dar feedback inmediato y se devuelve el mensaje ya creado.
 */
export async function sendCodeFile(
  accountId: string,
  toUserId: string,
  file: { name: string; lang: string; content: string },
  replyTo: string | null = null
): Promise<SocialResult<DirectMessage>> {
  const name = file.name.trim().replace(/[\\/]/g, '').slice(0, 255)
  if (!name) return fail(t('main.el.archivo.no.tiene.nombre'))

  const check = checkCodeFileContent(file.content)
  if (!check.ok) return fail(check.error)

  const uploaded = await uploadCodeFile(accountId, toUserId, {
    name,
    lang: file.lang,
    content: file.content,
    replyTo
  })
  if (!uploaded.ok || !uploaded.data?.message) {
    return fail(uploaded.error ?? t('main.no.se.pudo.compartir.el'))
  }
  return ok(uploaded.data.message)
}

/** Baja el contenido de un archivo compartido (URL firmada + verificación sha). */
export async function getCodeFileContent(
  accountId: string,
  messageId: string
): Promise<SocialResult<{ content: string; meta: SocialCodeFile }>> {
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))

  const { data } = await supabase
    .from('messages')
    .select('body,kind')
    .eq('id', messageId)
    .maybeSingle()
  if (!data) return fail(t('main.mensaje.no.encontrado'))
  const meta = decodeCodeFile((data as { body: string }).body)
  if (!meta) return fail(t('main.el.archivo.compartido.esta.danado'))

  const signed = await codeFileSignedUrl(accountId, messageId)
  if (!signed.ok || !signed.data) return fail(signed.error ?? t('main.no.se.pudo.abrir.el'))

  let res: Response
  try {
    res = await fetch(signed.data.url)
  } catch (error) {
    return fail(error instanceof Error ? error.message : t('main.no.se.pudo.descargar.el'))
  }
  if (!res.ok) return fail(`No se pudo descargar el archivo (${res.status}).`)

  const content = await res.text()
  if (content.length > SOCIAL_RULES.codeFileMaxChars) return fail(t('main.el.archivo.es.demasiado.grande'))
  const sha = createHash('sha256').update(content, 'utf8').digest('hex')
  if (sha !== meta.sha) return fail(t('main.el.archivo.no.coincide.con'))

  return ok({ content, meta })
}

/** Borra el archivo (objeto en R2) y su mensaje — libera cupo. */
export async function deleteCodeFileMessage(
  accountId: string,
  messageId: string
): Promise<SocialResult<boolean>> {
  // Si el objeto ya expiró, el DELETE falla: igual se borra el mensaje.
  await deleteCodeFileObject(accountId, messageId)
  const deleted = await deleteMessage(accountId, messageId)
  if (!deleted.ok) return fail(deleted.error ?? t('main.no.se.pudo.borrar.el'))
  return ok(true)
}

export async function editMessage(
  accountId: string,
  messageId: string,
  body: string
): Promise<SocialResult<DirectMessage>> {
  const text = body.trim()
  if (!text) return fail(t('main.el.mensaje.esta.vacio'))
  if (text.length > SOCIAL_RULES.messageMax) return fail(t('main.mensaje.demasiado.largo'))
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const { data, error } = await supabase
    .from('messages')
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('sender_id', accountId)
    // Un `codefile` no se edita: su body es el sobre (romper el JSON lo dejaría
    // irreconocible). El filtro hace que no matchee y caiga en "no encontrado".
    .eq('kind', 'normal')
    .select('id,sender_id,recipient_id,kind,body,created_at,read_at,reply_to,edited_at')
    .single()
  if (error) return fail(cleanError(error.message))
  if (!data) return fail(t('main.mensaje.no.encontrado'))
  const edited = mapMessage(data as MessageRow)
  const attachMap = await hydrateAttachments(supabase, [edited.id])
  return ok({ ...edited, attachments: attachMap.get(edited.id) ?? [] })
}

export async function deleteMessage(
  accountId: string,
  messageId: string
): Promise<SocialResult<null>> {
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const { error } = await supabase.from('messages').delete().eq('id', messageId).eq('sender_id', accountId)
  if (error) return fail(cleanError(error.message))
  return ok(null)
}

export async function markRead(accountId: string, withUserId: string): Promise<SocialResult<null>> {
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', accountId)
    .eq('sender_id', withUserId)
    .is('read_at', null)
  if (error) return fail(cleanError(error.message))
  return ok(null)
}

// ── Presencia ──────────────────────────────────────────────────────────────

interface PresenceRow {
  user_id: string
  status: string
  activity: Record<string, unknown> | null
  updated_at: string
}

const STATUSES: PresenceStatus[] = ['online', 'away', 'busy', 'offline']

function mapPresence(row: PresenceRow): UserPresence {
  const activity = row.activity ?? {}
  return {
    userId: row.user_id,
    status: STATUSES.includes(row.status as PresenceStatus)
      ? (row.status as PresenceStatus)
      : 'offline',
    activity: {
      project: typeof activity.project === 'string' ? activity.project : undefined,
      file: typeof activity.file === 'string' ? activity.file : undefined
    },
    updatedAt: row.updated_at
  }
}

/** Presencia de la cuenta + sus amigos (RLS ya limita). */
export async function getPresence(accountId: string): Promise<SocialResult<UserPresence[]>> {
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const { data, error } = await supabase
    .from('presence')
    .select('user_id,status,activity,updated_at')
  if (error) return fail(cleanError(error.message))
  return ok(((data ?? []) as PresenceRow[]).map(mapPresence))
}

/** Publica mi estado/actividad (insert si falta + update de lo mío). */
export async function setPresence(
  accountId: string,
  status: PresenceStatus,
  activity: PresenceActivity
): Promise<SocialResult<null>> {
  const supabase = await clientOf(accountId)
  if (!supabase) return fail(t('main.cuenta.no.encontrada'))
  const cleanActivity: PresenceActivity = {}
  if (activity?.project) cleanActivity.project = String(activity.project).slice(0, 80)
  if (activity?.file) cleanActivity.file = String(activity.file).slice(0, 120)
  const now = new Date().toISOString()

  // 1) Garantizar la fila (ON CONFLICT DO NOTHING → solo INSERT).
  const { error: ensureErr } = await supabase
    .from('presence')
    .upsert(
      { user_id: accountId, status, activity: cleanActivity, updated_at: now },
      { onConflict: 'user_id', ignoreDuplicates: true }
    )
  if (ensureErr && ensureErr.code !== '23505') {
    return fail(cleanError(ensureErr.message))
  }
  // 2) Actualizar estado/actividad (grant por columna).
  const { error } = await supabase
    .from('presence')
    .update({ status, activity: cleanActivity, updated_at: now })
    .eq('user_id', accountId)
  if (error) return fail(cleanError(error.message))
  return ok(null)
}

// ── Realtime (un canal por cuenta) ─────────────────────────────────────────

export interface SocialRealtimeHandlers {
  incomingMessage: (message: DirectMessage) => void
  messageUpdated: (message: DirectMessage) => void
  messageDeleted: (payload: { messageId: string; peerId: string }) => void
  requestsChanged: () => void
  friendsChanged: () => void
  /**
   * Cambio de presencia CON la fila ya resuelta.
   *
   * Antes iba sin payload y el renderer respondía con un refetch completo
   * (amigos + solicitudes + presencia): cada latido de cada amigo disparaba 3
   * queries y un re-render del panel entero. Con la fila sólo se actualiza la
   * entrada de ese amigo.
   */
  presenceChanged: (presence: UserPresence) => void
  typingChanged: (payload: { userId: string; peerId: string; typing: boolean }) => void
}

const channels = new Map<
  string,
  { client: SupabaseClient; channel: RealtimeChannel; typingChannel?: RealtimeChannel; status: string }
>()

/** Reintentos de reconexión con backoff (un timer por cuenta, sin duplicar). */
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
const reconnectAttempts = new Map<string, number>()

/**
 * Programa UNA reconexión con backoff exponencial (2s, 4s, 8s… tope 30s).
 * Antes era un `setTimeout` fijo de 3s: con el JWT vencido, cada intento
 * fallaba y volvía a agendar al instante → bucle y spam en la terminal.
 * El timer único también evita apilar reintentos si el watchdog pide `watch`.
 */
function scheduleReconnect(accountId: string, handlers: SocialRealtimeHandlers): void {
  if (reconnectTimers.has(accountId)) return
  const attempt = (reconnectAttempts.get(accountId) ?? 0) + 1
  reconnectAttempts.set(accountId, attempt)
  const delay = Math.min(30_000, 2_000 * 2 ** Math.min(attempt - 1, 4))
  const timer = setTimeout(() => {
    reconnectTimers.delete(accountId)
    void watchAccount(accountId, handlers)
  }, delay)
  reconnectTimers.set(accountId, timer)
}

function clearReconnect(accountId: string): void {
  const timer = reconnectTimers.get(accountId)
  if (timer) clearTimeout(timer)
  reconnectTimers.delete(accountId)
  reconnectAttempts.delete(accountId)
}

/**
 * Garantiza una sesión NO vencida antes de suscribir a Realtime. Devuelve
 * `false` si no hay sesión o si el refresh falló: en ese caso NO conviene
 * suscribir (el canal fallaría y reintentaría en vano).
 */
async function ensureFreshSession(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession()
    const expiresAt = data.session?.expires_at
    if (!data.session) return false
    if (expiresAt && expiresAt * 1000 < Date.now() + 60_000) {
      const { error } = await supabase.auth.refreshSession()
      if (error) return false
    }
    return true
  } catch {
    return false
  }
}

/** Abre (o reabre) el canal de Realtime de esa cuenta. Idempotente si ya está OK. */
export async function watchAccount(
  accountId: string,
  handlers: SocialRealtimeHandlers
): Promise<void> {
  const existing = channels.get(accountId)
  if (existing) {
    // Ya conectado: no tocar. Si quedó a medias, se recrea.
    if (existing.status === 'SUBSCRIBED') return
    channels.delete(accountId)
    void existing.client.removeChannel(existing.channel)
    if (existing.typingChannel) void existing.client.removeChannel(existing.typingChannel)
  }
  if (
    typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined' &&
    process.env.NODE_ENV !== 'production'
  ) {
    console.warn('[social-rt] WebSocket NO disponible en el main → Realtime no va a conectar')
  }
  const supabase = await clientOf(accountId)
  if (!supabase) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[social-rt] sin cliente para', accountId.slice(0, 8), '→ reintento')
    }
    // El cliente puede no estar listo (token recién guardado): reintentar.
    scheduleReconnect(accountId, handlers)
    return
  }
  // Sesión vencida y sin poder refrescar: reintentar con backoff en vez de
  // suscribir un canal condenado.
  const fresh = await ensureFreshSession(supabase)
  if (!fresh) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[social-rt] sesión no válida para', accountId.slice(0, 8), '→ reintento')
    }
    // El cliente cacheado quedó con una sesión inválida: se saca del pool para
    // que el próximo intento lo rearme desde los tokens guardados.
    //
    // OJO: `forgetClient`, NO `dropClient`. `dropClient` hace `signOut` sobre el
    // MISMO objeto cliente, y ese cliente puede estar en manos de una operación
    // en vuelo (el INSERT de un mensaje, un poll): al firmarlo, esa request sale
    // sin JWT, `auth.uid()` queda NULL y la RLS rechaza el INSERT con 42501.
    // Como 42501 es el código de cualquier falta de permiso, el chat lo
    // reportaba como "solo puedes escribirle a tus amigos".
    forgetClient(accountId)
    scheduleReconnect(accountId, handlers)
    return
  }
  const uid = accountId
  const channel = supabase
    .channel(`social:${uid}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${uid}` },
      async (payload) => {
        const row = payload.new as MessageRow
        let preview = null
        if (row.reply_to) {
          const { data } = await supabase
            .from('messages')
            .select('id,body,sender_id')
            .eq('id', row.reply_to)
            .maybeSingle()
          if (data) preview = { id: (data as any).id, body: (data as any).body, senderId: (data as any).sender_id }
        }
        const attachMap = await hydrateAttachments(supabase, [row.id])
        handlers.incomingMessage({ ...mapMessage(row), attachments: attachMap.get(row.id) ?? [], replyPreview: preview })
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'friend_requests', filter: `addressee_id=eq.${uid}` },
      () => handlers.requestsChanged()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'friend_requests', filter: `requester_id=eq.${uid}` },
      () => handlers.requestsChanged()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'friendships', filter: `user_a=eq.${uid}` },
      () => handlers.friendsChanged()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'friendships', filter: `user_b=eq.${uid}` },
      () => handlers.friendsChanged()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'presence' },
      (payload) => handlers.presenceChanged(mapPresence(payload.new as PresenceRow))
    )
  // Adjuntos: llegan DESPUÉS del INSERT del mensaje (el emisor sube las
  // imágenes antes de crear la fila, pero las filas de adjuntos se insertan
  // justo después). Sin esto, el receptor ve el mensaje sin la imagen hasta
  // recargar. RLS filtra: solo llega lo que puedo leer.
  channel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message_attachments' },
      async (payload) => {
        const att = payload.new as AttachmentRow
        const { data: parent } = await supabase
          .from('messages')
          .select('id,sender_id,recipient_id,kind,body,created_at,read_at,reply_to,edited_at')
          .eq('id', att.message_id)
          .maybeSingle()
        if (!parent) return
        const row = parent as MessageRow
        if (row.sender_id !== uid && row.recipient_id !== uid) return
        const attachMap = await hydrateAttachments(supabase, [row.id])
        handlers.messageUpdated({ ...mapMessage(row), attachments: attachMap.get(row.id) ?? [] })
      }
    )
  // Mensajes editados / borrados (ambos participantes)
  channel
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${uid}` },
      async (payload) => {
        const row = payload.new as MessageRow
        let preview = null
        if (row.reply_to) {
          const { data } = await supabase.from('messages').select('id,body,sender_id').eq('id', row.reply_to).maybeSingle()
          if (data) preview = { id: (data as any).id, body: (data as any).body, senderId: (data as any).sender_id }
        }
        const attachMap = await hydrateAttachments(supabase, [row.id])
        handlers.messageUpdated({ ...mapMessage(row), attachments: attachMap.get(row.id) ?? [], replyPreview: preview })
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `recipient_id=eq.${uid}` },
      async (payload) => {
        const row = payload.new as MessageRow
        let preview = null
        if (row.reply_to) {
          const { data } = await supabase.from('messages').select('id,body,sender_id').eq('id', row.reply_to).maybeSingle()
          if (data) preview = { id: (data as any).id, body: (data as any).body, senderId: (data as any).sender_id }
        }
        const attachMap = await hydrateAttachments(supabase, [row.id])
        handlers.messageUpdated({ ...mapMessage(row), attachments: attachMap.get(row.id) ?? [], replyPreview: preview })
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages', filter: `sender_id=eq.${uid}` },
      (payload) => handlers.messageDeleted({ messageId: (payload.old as MessageRow).id, peerId: (payload.old as MessageRow).recipient_id })
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages', filter: `recipient_id=eq.${uid}` },
      (payload) => handlers.messageDeleted({ messageId: (payload.old as MessageRow).id, peerId: (payload.old as MessageRow).sender_id })
    )

  // Typing broadcast: cada cuenta escucha su propio canal typing:<uid>
  const typingChannel = supabase.channel(`typing:${uid}`, { config: { broadcast: { ack: false } } })
  typingChannel.on('broadcast', { event: 'typing' }, (payload) => {
    const p = payload.payload as { userId: string; typing: boolean }
    if (p?.userId) handlers.typingChanged({ userId: p.userId, peerId: uid, typing: !!p.typing })
  })
  typingChannel.subscribe()

  // La entrada se registra ANTES de subscribir para que el callback vea el estado.
  channels.set(accountId, { client: supabase, channel, status: 'CONNECTING' })
  channel.subscribe((status, error) => {
    const entry = channels.get(accountId)
    if (entry && entry.channel === channel) entry.status = status
    if (process.env.NODE_ENV !== 'production') {
      console.log('[social-rt]', uid.slice(0, 8), status, error?.message ?? '')
    }
    if (status === 'SUBSCRIBED') {
      // Conectado: resetear el backoff.
      clearReconnect(accountId)
      return
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      const current = channels.get(accountId)
      if (current && current.channel === channel) {
        channels.delete(accountId)
        void channel.unsubscribe()
        if (current.typingChannel) void current.client.removeChannel(current.typingChannel)
        scheduleReconnect(accountId, handlers)
      }
    }
  })
  // Guardar typingChannel para cleanup (attach to entry)
  const entry = channels.get(accountId)
  if (entry) (entry as any).typingChannel = typingChannel
}

export async function sendTyping(accountId: string, peerId: string, typing: boolean): Promise<void> {
  const supabase = await clientOf(accountId)
  if (!supabase) return
  // Broadcast al canal del peer
  const ch = supabase.channel(`typing:${peerId}`, { config: { broadcast: { ack: false } } })
  // Necesita estar suscrito antes de enviar (realtime broadcast requiere join)
  await new Promise<void>((resolve) => {
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
    })
    // fallback si ya está
    setTimeout(() => resolve(), 800)
  })
  await ch.send({ type: 'broadcast', event: 'typing', payload: { userId: accountId, typing } })
  // No dejamos el canal abierto mucho; realtime lo mantiene, pero lo soltamos después
  setTimeout(() => void supabase.removeChannel(ch), 2000)
}

export function stopWatching(accountId: string): void {
  clearReconnect(accountId)
  const entry = channels.get(accountId)
  if (!entry) return
  channels.delete(accountId)
  void entry.client.removeChannel(entry.channel)
  if (entry.typingChannel) void entry.client.removeChannel(entry.typingChannel)
}
