// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Trust store de publishers (TOFU + pinning por extensión).
 *
 * El primer `.sef` firmado de una extensión fija su clave pública. Una
 * actualización con OTRA clave se rechaza: si el autor rota la clave, tiene que
 * publicar el paquete con el mismo id tras desinstalar (o una futura rotación
 * firmada por la clave vieja). Esto evita que un repo comprometido reemplace el
 * binario con una clave nueva sin que el usuario se entere.
 */

import { app } from 'electron'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

interface PublisherRecord {
  keyId: string
  publicKey: string
}

type TrustStore = Record<string, PublisherRecord>

export type PublisherStatus = 'match' | 'new' | 'mismatch'

function storePath(): string {
  return path.join(app.getPath('userData'), 'extension-publishers.json')
}

function validId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)
}

async function load(): Promise<TrustStore> {
  try {
    const raw = await fs.readFile(storePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: TrustStore = {}
    for (const [id, value] of Object.entries(parsed)) {
      const record = value as Partial<PublisherRecord>
      if (
        validId(id) &&
        typeof record.keyId === 'string' &&
        typeof record.publicKey === 'string'
      ) {
        out[id] = { keyId: record.keyId, publicKey: record.publicKey }
      }
    }
    return out
  } catch {
    return {}
  }
}

async function save(store: TrustStore): Promise<void> {
  const target = storePath()
  const tmp = `${target}.tmp`
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(tmp, JSON.stringify(store, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 })
  await fs.rename(tmp, target)
}

/** Compara la clave de un paquete con la fijada para esa extensión. */
export async function publisherStatus(
  extensionId: string,
  keyId: string,
  publicKey: string
): Promise<PublisherStatus> {
  if (!validId(extensionId)) return 'mismatch'
  const record = (await load())[extensionId]
  if (!record) return 'new'
  return record.keyId === keyId && record.publicKey === publicKey ? 'match' : 'mismatch'
}

/** Fija la clave de una extensión (solo tras una instalación verificada). */
export async function rememberPublisher(
  extensionId: string,
  keyId: string,
  publicKey: string
): Promise<void> {
  if (!validId(extensionId)) return
  const store = await load()
  store[extensionId] = { keyId, publicKey }
  await save(store)
}

/** Borra el pin (al desinstalar). */
export async function forgetPublisher(extensionId: string): Promise<void> {
  const store = await load()
  if (!(extensionId in store)) return
  delete store[extensionId]
  await save(store)
}
