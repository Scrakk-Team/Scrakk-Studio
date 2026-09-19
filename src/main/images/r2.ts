/**
 * Cliente R2 (API S3-compatible, SigV4) para el proceso main.
 *
 * Sin dependencias nuevas: firma HMAC-SHA256 con node:crypto y PUT con fetch.
 * Las credenciales van por entorno (nunca hardcodeadas):
 *
 *  SCRAKK_R2_ENDPOINT      https://<accountid>.r2.cloudflarestorage.com
 *  SCRAKK_R2_ACCESS_KEY    access key del token R2
 *  SCRAKK_R2_SECRET_KEY    secret key del token R2
 *  SCRAKK_R2_BUCKET_CHAT   (default: scrakk-chat-images)
 *  SCRAKK_R2_BUCKET_AVATAR (default: scrakk-avatars)
 *  SCRAKK_R2_PUBLIC_CHAT   base pública del bucket chat (https://pub-….r2.dev)
 *  SCRAKK_R2_PUBLIC_AVATAR base pública del bucket avatares
 */

import { createHash, createHmac } from 'node:crypto'

export type R2Kind = 'chat' | 'avatar'

interface R2Config {
  endpoint: string
  bucket: string
  accessKey: string
  secretKey: string
  publicBase: string
}

function cfgFor(kind: R2Kind): R2Config | null {
  const endpoint = (process.env.SCRAKK_R2_ENDPOINT ?? 'https://eaa65e50775620523cf9a829e7b465a5.r2.cloudflarestorage.com').trim().replace(/\/+$/, '')
  const accessKey = (process.env.SCRAKK_R2_ACCESS_KEY ?? '').trim()
  const secretKey = (process.env.SCRAKK_R2_SECRET_KEY ?? '').trim()
  const bucket = (
    kind === 'avatar' ? process.env.SCRAKK_R2_BUCKET_AVATAR : process.env.SCRAKK_R2_BUCKET_CHAT
  )?.trim() || (kind === 'avatar' ? 'scrakk-avatars' : 'scrakk-chat-images')
  const publicBase = (
    kind === 'avatar'
      ? (process.env.SCRAKK_R2_PUBLIC_AVATAR ?? 'https://pub-da2990c67c154667a4c23c857b0398b5.r2.dev')
      : (process.env.SCRAKK_R2_PUBLIC_CHAT ?? 'https://pub-cd0e99d124f844e78f2ece43da6b8c1f.r2.dev')
  ).trim().replace(/\/+$/, '')
  if (!endpoint || !accessKey || !secretKey || !publicBase) return null
  return { endpoint, bucket, accessKey, secretKey, publicBase }
}

export function isR2Configured(kind: R2Kind): boolean {
  return cfgFor(kind) !== null
}

function extFor(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/avif') return 'avif'
  return 'bin'
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

async function putObject(cfg: R2Config, key: string, body: Buffer, mime: string): Promise<void> {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${key}`)
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256Hex(body)
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const canonicalRequest = ['PUT', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${dateStamp}/auto/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(Buffer.from(canonicalRequest))].join('\n')
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${cfg.secretKey}`, dateStamp), 'auto'), 's3'), 'aws4_request')
  const signature = hmac(kSigning, stringToSign).toString('hex')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const res = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        'Content-Type': mime,
        'Content-Length': String(body.length),
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
      },
      body: new Uint8Array(body),
      signal: controller.signal
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`R2 respondió ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Sube el binario ya validado. Devuelve la URL pública. */
export async function uploadToR2(
  base64: string,
  mime: string,
  kind: R2Kind,
  name: string
): Promise<{ ok: true; url: string; key: string } | { ok: false; error: string }> {
  const cfg = cfgFor(kind)
  if (!cfg) return { ok: false, error: 'R2 no configurado' }
  let body: Buffer
  try {
    body = Buffer.from(base64, 'base64')
  } catch {
    return { ok: false, error: 'Imagen inválida' }
  }
  if (body.length === 0) return { ok: false, error: 'Imagen vacía' }
  const rawName = (name || 'img').replace(/\.[A-Za-z0-9]{1,8}$/, '')
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'img'
  const d = new Date()
  const key = `${crypto.randomUUID()}-${safeName}.${extFor(mime)}`
  const prefix = kind === 'avatar' ? 'avatars' : `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const fullKey = `${prefix}/${key}`
  try {
    await putObject(cfg, fullKey, body, mime)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  return { ok: true, url: `${cfg.publicBase}/${fullKey}`, key: fullKey }
}
