// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Verificación de la firma Ed25519 de un `.sef` (formato de sef-builder).
 *
 * `signature.json` incluye el SHA-256 del manifest y de cada archivo, la clave
 * pública (SPKI DER base64), un `keyId` derivado de esa clave y la firma del
 * payload canónico. Se recalculan TODOS los hashes del zip: si se agrega,
 * quita o modifica cualquier entrada, la firma deja de valer. No se confía en
 * `signature.files`.
 */

import {
  createHash,
  createPublicKey,
  verify,
  type KeyObject
} from 'node:crypto'

export const SIGNATURE_FILE = 'signature.json'
const SIGNATURE_VERSION = 1
const SIGNATURE_ALGORITHM = 'ed25519'
const MANIFEST = 'manifest.json'

export interface SefSignatureResult {
  signed: boolean
  ok: boolean
  keyId?: string
  /** SPKI DER en base64 (para el trust store). */
  publicKey?: string
  reason?: string
}

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function keyIdFor(der: Buffer): string {
  return `sha256:${sha256Hex(new Uint8Array(der)).slice(0, 32)}`
}

function publicKeyFromDer(der: Buffer): KeyObject {
  return createPublicKey({ key: der, format: 'der', type: 'spki' })
}

function canonicalPayload(meta: {
  version: number
  algorithm: string
  keyId: string
  manifestSha256: string
  files: Record<string, string>
}): Buffer {
  const files = Object.fromEntries(
    Object.entries(meta.files).sort(([a], [b]) => a.localeCompare(b))
  )
  return Buffer.from(
    JSON.stringify({
      version: meta.version,
      algorithm: meta.algorithm,
      keyId: meta.keyId,
      manifestSha256: meta.manifestSha256,
      files
    }),
    'utf-8'
  )
}

interface RawSignature {
  version?: unknown
  algorithm?: unknown
  keyId?: unknown
  publicKey?: unknown
  manifestSha256?: unknown
  files?: unknown
  signature?: unknown
}

/** Verifica la firma de un paquete ya descomprimido. Nunca lanza. */
export function verifySefFiles(files: Record<string, Uint8Array>): SefSignatureResult {
  const raw = files[SIGNATURE_FILE]
  if (!raw) return { signed: false, ok: false, reason: 'paquete sin firma' }

  let sig: RawSignature
  try {
    sig = JSON.parse(new TextDecoder().decode(raw)) as RawSignature
  } catch {
    return { signed: true, ok: false, reason: 'signature.json inválido' }
  }
  if (sig.version !== SIGNATURE_VERSION || sig.algorithm !== SIGNATURE_ALGORITHM) {
    return { signed: true, ok: false, reason: 'firma con versión/algoritmo no soportado' }
  }
  if (
    typeof sig.keyId !== 'string' ||
    typeof sig.publicKey !== 'string' ||
    typeof sig.signature !== 'string' ||
    typeof sig.manifestSha256 !== 'string' ||
    !sig.files ||
    typeof sig.files !== 'object'
  ) {
    return { signed: true, ok: false, reason: 'firma incompleta' }
  }

  let der: Buffer
  let keyId: string
  try {
    der = Buffer.from(sig.publicKey, 'base64')
    if (der.length === 0) throw new Error('clave vacía')
    keyId = keyIdFor(der)
  } catch {
    return { signed: true, ok: false, reason: 'clave pública inválida' }
  }
  if (keyId !== sig.keyId) {
    return { signed: true, ok: false, reason: 'keyId no coincide con la clave' }
  }

  const actual: Record<string, string> = {}
  for (const [name, data] of Object.entries(files)) {
    if (name === SIGNATURE_FILE) continue
    actual[name] = sha256Hex(data)
  }
  const expected = sig.files as Record<string, unknown>
  const names = new Set([...Object.keys(actual), ...Object.keys(expected)])
  for (const name of names) {
    if (expected[name] !== actual[name]) {
      return { signed: true, ok: false, keyId, publicKey: sig.publicKey, reason: `archivo alterado: ${name}` }
    }
  }
  if (sig.manifestSha256 !== actual[MANIFEST]) {
    return { signed: true, ok: false, keyId, publicKey: sig.publicKey, reason: 'manifest alterado' }
  }

  const meta = {
    version: SIGNATURE_VERSION,
    algorithm: SIGNATURE_ALGORITHM,
    keyId,
    manifestSha256: sig.manifestSha256,
    files: actual
  }
  try {
    const valid = verify(
      null,
      canonicalPayload(meta),
      publicKeyFromDer(der),
      Buffer.from(sig.signature, 'base64')
    )
    return valid
      ? { signed: true, ok: true, keyId, publicKey: sig.publicKey }
      : { signed: true, ok: false, keyId, publicKey: sig.publicKey, reason: 'firma no válida' }
  } catch {
    return { signed: true, ok: false, keyId, publicKey: sig.publicKey, reason: 'firma no válida' }
  }
}
