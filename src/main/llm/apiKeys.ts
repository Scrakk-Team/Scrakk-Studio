// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * API keys de proveedores LLM — almacenamiento en el MAIN.
 *
 * Antes vivían en `localStorage['scrakk-studio:providers']`, o sea en el perfil
 * de Chromium en texto plano y accesibles desde cualquier XSS/extensión que
 * corriera en el renderer. Ahora el renderer solo conoce si hay key (para la
 * UI); el valor lo resuelve el main al abrir el stream.
 *
 * Cifrado: `safeStorage` cuando el SO lo ofrece (keychain/libsecret/DPAPI).
 * Sin keyring se guarda con permisos `0600` y se avisa por consola; el objetivo
 * principal (no dejarlas en el storage del navegador) se cumple igual.
 */

import { app, safeStorage } from 'electron'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

interface KeyFile {
  version: 1
  encrypted: boolean
  /** base64 del JSON (`{ providerId: key }`) o del blob cifrado. */
  data: string
}

type KeyMap = Record<string, string>

const PROVIDER_ID = /^[A-Za-z0-9._-]{1,64}$/

function storePath(): string {
  return path.join(app.getPath('userData'), 'secrets', 'api-keys.json')
}

function validId(providerId: unknown): providerId is string {
  return typeof providerId === 'string' && PROVIDER_ID.test(providerId)
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/**
 * `basic_text` es el backend de Chromium sin keyring (clave fija "peanuts"): no
 * protege nada. Se trata como "sin cifrado" y las keys NO se persisten.
 */
function secureEncryption(): boolean {
  if (!canEncrypt()) return false
  try {
    if (safeStorage.getSelectedStorageBackend?.() === 'basic_text') return false
  } catch {
    // Versiones sin getSelectedStorageBackend: se confía en canEncrypt().
  }
  return true
}

let cache: KeyMap | null = null

function parseMap(raw: string): KeyMap {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: KeyMap = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (validId(id) && typeof value === 'string' && value.length > 0) out[id] = value
    }
    return out
  } catch {
    return {}
  }
}

async function load(): Promise<KeyMap> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(storePath(), 'utf-8')
    const file = JSON.parse(raw) as Partial<KeyFile>
    const bytes = Buffer.from(typeof file.data === 'string' ? file.data : '', 'base64')
    const json =
      file.encrypted && secureEncryption() ? safeStorage.decryptString(bytes) : bytes.toString('utf-8')
    cache = parseMap(json)
    // Un archivo en claro de una versión anterior no se deja en disco.
    if (!file.encrypted) await fs.rm(storePath(), { force: true }).catch(() => undefined)
  } catch {
    cache = {}
  }
  return cache
}

/** Devuelve true si las keys quedaron persistidas (false = solo memoria). */
async function save(keys: KeyMap): Promise<boolean> {
  cache = keys
  if (!secureEncryption()) {
    console.warn(
      '[llm] sin keyring seguro: las API keys viven en memoria y no se persisten en disco'
    )
    return false
  }
  const json = JSON.stringify(keys)
  const bytes = safeStorage.encryptString(json)
  const file: KeyFile = { version: 1, encrypted: true, data: bytes.toString('base64') }
  const target = storePath()
  const tmp = `${target}.tmp`
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(tmp, JSON.stringify(file), { encoding: 'utf-8', mode: 0o600 })
  await fs.rename(tmp, target)
  await fs.chmod(target, 0o600).catch(() => undefined)
  return true
}

/** Key descifrada de un proveedor ('' si no hay). Uso interno del main. */
export async function getApiKey(providerId: string): Promise<string> {
  if (!validId(providerId)) return ''
  return (await load())[providerId] ?? ''
}

/** True si el proveedor tiene una key guardada (lo único que ve el renderer). */
export async function hasApiKey(providerId: string): Promise<boolean> {
  return (await getApiKey(providerId)).length > 0
}

export async function apiKeyStatus(): Promise<Record<string, boolean>> {
  const keys = await load()
  return Object.fromEntries(Object.entries(keys).map(([id, value]) => [id, value.length > 0]))
}

export async function setApiKey(providerId: string, apiKey: string): Promise<boolean> {
  if (!validId(providerId) || typeof apiKey !== 'string') return false
  const key = apiKey.trim()
  const keys = { ...(await load()) }
  if (key) keys[providerId] = key
  else delete keys[providerId]
  return save(keys)
}

export async function deleteApiKey(providerId: string): Promise<boolean> {
  return setApiKey(providerId, '')
}

/**
 * Migración desde el localStorage viejo: guarda las keys en el main y devuelve
 * cuántas se movieron. El renderer borra `apiKeys` del storage al terminar.
 */
export async function migrateApiKeys(keys: unknown): Promise<number> {
  if (!keys || typeof keys !== 'object') return 0
  let moved = 0
  const current = { ...(await load()) }
  for (const [id, value] of Object.entries(keys as Record<string, unknown>)) {
    if (!validId(id) || typeof value !== 'string' || !value.trim()) continue
    if (current[id] === value.trim()) continue
    current[id] = value.trim()
    moved++
  }
  if (moved > 0) await save(current)
  return moved
}
