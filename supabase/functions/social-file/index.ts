// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * social-file — gatekeeper de los archivos del chat social.
 *
 * Es la ÚNICA puerta a R2: las credenciales viven en Supabase Vault y solo las
 * lee esta función (service_role), nunca la app. Valida JWT, autoría, límites
 * (líneas/caracteres) y cupo, y solo entonces sube, firma o borra.
 *
 * El INSERT del mensaje lo hace ESTA función (no el cliente): así la cuota
 * cuenta mensajes reales y el trigger `messages_rate_limit` de la DB aplica.
 * Si el cliente insertara, se podría subir a R2 sin mensaje (huérfanos) y sin
 * tope de tasa.
 *
 * Acciones (POST JSON):
 *   { action: 'upload', peerId, name, lang, content, replyTo? }
 *     → valida + sube a R2 + inserta el mensaje → { message }
 *   { action: 'url', messageId }
 *     → si sos participante, devuelve { url, expiresIn } (presigned GET)
 *   { action: 'delete', messageId }
 *     → si sos el emisor, borra el objeto (libera cupo)
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX_LINES = 10_000
const MAX_CHARS = 512 * 1024
const QUOTA_PER_CONVERSATION = 15
const TTL_DAYS = 60
const KEY_PREFIX = 'code'
const MESSAGE_SELECT =
  'id,sender_id,recipient_id,kind,body,created_at,read_at,reply_to,edited_at'

/** Errores de negocio: se devuelven con el código para que la app los muestre. */
class BadRequest extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const env = (name: string): string => (Deno.env.get(name) ?? '').trim()

/**
 * Config de R2: vive en Supabase Vault (la expone `get_r2_config()`, ejecutable
 * SOLO por service_role) con fallback a env por si algún día se usan secrets.
 */
async function r2Client(
  supabase: ReturnType<typeof createClient>
): Promise<{ client: S3Client; bucket: string }> {
  const { data } = await supabase.rpc('get_r2_config')
  const cfg = (data ?? {}) as {
    endpoint?: string
    accessKey?: string
    secretKey?: string
    bucket?: string
  }
  const endpoint = (cfg.endpoint ?? env('SCRAKK_R2_ENDPOINT')).trim()
  const accessKeyId = (cfg.accessKey ?? env('SCRAKK_R2_ACCESS_KEY')).trim()
  const secretAccessKey = (cfg.secretKey ?? env('SCRAKK_R2_SECRET_KEY')).trim()
  const bucket =
    (cfg.bucket ?? env('SCRAKK_R2_BUCKET_FILES')).trim() || 'scrakk-chat-files'
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new BadRequest('R2 no configurado en el servidor.', 503)
  }
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey }
  })
  return { client, bucket }
}

/** sha256 hex del contenido — lo calcula el SERVIDOR (no se confía en el cliente). */
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Cuenta líneas igual que el codec del cliente (una cadena vacía tiene 0). */
function countLines(text: string): number {
  if (text.length === 0) return 0
  let lines = 1
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) lines += 1
  }
  return lines
}

/**
 * Keys que genera `handleUpload`: `code/<uuid>`. Cualquier otra cosa (incluida
 * una key de otro prefijo o con `..`) se rechaza antes de firmar/borrar.
 * Antes solo se comprobaba `..`, así que un mensaje manipulado podía pedir una
 * URL firmada — o el borrado — de cualquier objeto del bucket.
 */
const CODE_KEY_RE = /^code\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Extrae la key del sobre JSON que guarda el mensaje `codefile`. */
function keyFromBody(body: string): string | null {
  try {
    const meta = JSON.parse(body) as { kind?: unknown; key?: unknown }
    if (meta.kind !== 'codefile') return null
    if (typeof meta.key !== 'string' || !CODE_KEY_RE.test(meta.key)) return null
    return meta.key
  } catch {
    return null
  }
}

async function handleUpload(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const peerId = typeof payload.peerId === 'string' ? payload.peerId : ''
  const name = typeof payload.name === 'string' ? payload.name.slice(0, 255) : ''
  const lang = typeof payload.lang === 'string' ? payload.lang.slice(0, 64) : ''
  const content = typeof payload.content === 'string' ? payload.content : ''
  const replyTo =
    typeof payload.replyTo === 'string' && payload.replyTo.length > 0 ? payload.replyTo : null
  if (!peerId || !name) throw new BadRequest('Faltan datos del archivo.')
  // `peerId` se interpola en un filtro PostgREST (`.or(...)`): un UUID válido
  // evita inyectar condiciones en la consulta de amistad.
  if (!UUID_RE.test(peerId)) throw new BadRequest('peerId inválido.')
  if (content.length === 0) throw new BadRequest('El archivo está vacío.')
  if (content.length > MAX_CHARS) throw new BadRequest('El archivo supera el tamaño máximo.')
  const lines = countLines(content)
  if (lines > MAX_LINES) throw new BadRequest('El archivo supera el máximo de líneas.')

  // Debe ser un amigo (misma regla que el INSERT de messages).
  const { data: friendship } = await supabase
    .from('friendships')
    .select('user_a')
    .or(
      `and(user_a.eq.${userId},user_b.eq.${peerId}),and(user_a.eq.${peerId},user_b.eq.${userId})`
    )
    .maybeSingle()
  if (!friendship) throw new BadRequest('Solo puedes compartir con amigos.', 403)

  // Cupo: archivos VIVOS en esa conversación (los de más de 60 días ya no cuentan).
  const since = new Date(Date.now() - TTL_DAYS * 86_400_000).toISOString()
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'codefile')
    .eq('sender_id', userId)
    .eq('recipient_id', peerId)
    .gte('created_at', since)
  if ((count ?? 0) >= QUOTA_PER_CONVERSATION) {
    throw new BadRequest('Cupo de archivos lleno: borra alguno para liberar espacio.', 409)
  }

  const { client, bucket } = await r2Client(supabase)
  const key = `${KEY_PREFIX}/${crypto.randomUUID()}`
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new TextEncoder().encode(content),
      ContentType: 'text/plain; charset=utf-8'
    })
  )
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000).toISOString()
  const meta = {
    v: 1,
    kind: 'codefile',
    name,
    lang,
    lines,
    size: content.length,
    sha: await sha256Hex(content),
    key,
    expiresAt
  }

  // El mensaje lo inserta el SERVIDOR: acá sí corre el trigger de rate limit y
  // la cuota de arriba cuenta filas reales.
  const { data: row, error } = await supabase
    .from('messages')
    .insert({
      sender_id: userId,
      recipient_id: peerId,
      kind: 'codefile',
      body: JSON.stringify(meta),
      reply_to: replyTo
    })
    .select(MESSAGE_SELECT)
    .single()
  if (error) {
    // Sin mensaje no hay archivo: se borra el objeto para no dejar huérfanos.
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    } catch {
      // El lifecycle de 60 días lo limpia igual.
    }
    if (error.message.includes('msg_ratelimited')) {
      throw new BadRequest('msg_ratelimited', 429)
    }
    if (error.code === '23514') throw new BadRequest('El sobre del archivo es inválido.')
    if (error.message.includes('reply_not_in_dm')) {
      throw new BadRequest('El mensaje citado no es de esta conversación.')
    }
    console.error('[social-file] insert falló:', error)
    throw new BadRequest('No se pudo guardar el archivo.')
  }
  return { message: row }
}

/** Devuelve el mensaje si el usuario es participante (si no, lanza). */
async function participantMessage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  messageId: string
): Promise<{ body: string; senderId: string }> {
  if (!messageId) throw new BadRequest('Falta messageId.')
  const { data } = await supabase
    .from('messages')
    .select('body,sender_id,recipient_id,kind')
    .eq('id', messageId)
    .maybeSingle()
  if (!data) throw new BadRequest('El mensaje no existe.', 404)
  const row = data as { body: string; sender_id: string; recipient_id: string; kind: string }
  if (row.kind !== 'codefile') throw new BadRequest('El mensaje no es un archivo.')
  if (row.sender_id !== userId && row.recipient_id !== userId) {
    throw new BadRequest('No participas en esa conversación.', 403)
  }
  return { body: row.body, senderId: row.sender_id }
}

async function handleUrl(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const messageId = typeof payload.messageId === 'string' ? payload.messageId : ''
  const { body } = await participantMessage(supabase, userId, messageId)
  const key = keyFromBody(body)
  if (!key) throw new BadRequest('El mensaje no tiene archivo válido.')

  const { client, bucket } = await r2Client(supabase)
  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 300
  })
  return { url, expiresIn: 300 }
}

async function handleDelete(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const messageId = typeof payload.messageId === 'string' ? payload.messageId : ''
  const { body, senderId } = await participantMessage(supabase, userId, messageId)
  if (senderId !== userId) throw new BadRequest('Solo el emisor puede borrar el archivo.', 403)
  const key = keyFromBody(body)
  if (key) {
    const { client, bucket } = await r2Client(supabase)
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  }
  return { ok: true }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const json = (data: unknown, status = 200): Response =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) throw new BadRequest('Falta autenticación.', 401)

    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false }
    })
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) throw new BadRequest('Token inválido.', 401)
    const userId = userData.user.id

    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = payload.action

    if (action === 'upload') return json(await handleUpload(supabase, userId, payload))
    if (action === 'url') return json(await handleUrl(supabase, userId, payload))
    if (action === 'delete') return json(await handleDelete(supabase, userId, payload))
    throw new BadRequest('Acción desconocida.')
  } catch (error) {
    const status = error instanceof BadRequest ? error.status : 500
    // Los errores internos (R2, constraints, tablas) se quedan en el log: el
    // cliente recibe un código genérico y no detalles de la infraestructura.
    if (status >= 500) {
      console.error('[social-file]', error)
      return json({ error: 'Error interno.' }, status)
    }
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: message }, status)
  }
})
