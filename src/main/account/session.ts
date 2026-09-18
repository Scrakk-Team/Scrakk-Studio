/**
 * Store MULTI-CUENTA persistente (safeStorage).
 *
 * Guarda la sesión de cada cuenta (access + refresh token) + un snapshot de su
 * perfil, y cuál es la activa.
 *
 * Robustez en Linux: `safeStorage.isEncryptionAvailable()` puede dar `false`
 * (o la keyring estar lista más tarde) y hacíamos que la sesión se perdiera al
 * reiniciar. Ahora:
 *  - READ: intenta descifrar; si no puede, cae a un archivo de texto (legacy /
 *    keyring no lista) en vez de devolver "sin cuentas".
 *  - WRITE: cifra si se puede; si no, escribe igual en texto plano con 0600
 *    (userData, solo el usuario) para no perder la sesión.
 */

import { app, safeStorage } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AccountProfile, AccountSummary } from '@shared/account'

export interface StoredAccount {
  profile: AccountProfile
  accessToken: string
  refreshToken: string
}

interface Store {
  activeId: string | null
  accounts: Record<string, StoredAccount>
}

function emptyStore(): Store {
  return { activeId: null, accounts: {} }
}

function filePath(): string {
  return path.join(app.getPath('userData'), 'account', 'accounts.bin')
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function read(): Store {
  let raw: Buffer
  try {
    raw = fs.readFileSync(filePath())
  } catch {
    return emptyStore()
  }
  let json: string | null = null
  if (canEncrypt()) {
    try {
      json = safeStorage.decryptString(raw)
    } catch {
      json = null
    }
  }
  if (json === null) {
    // Keyring no lista o archivo en texto plano: intentar leerlo tal cual.
    json = raw.toString('utf-8')
  }
  try {
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return emptyStore()
    const store = parsed as Store
    return {
      activeId: typeof store.activeId === 'string' ? store.activeId : null,
      accounts: store.accounts && typeof store.accounts === 'object' ? store.accounts : {}
    }
  } catch {
    return emptyStore()
  }
}

function write(store: Store): void {
  const json = JSON.stringify(store)
  let buf: Buffer
  try {
    buf = canEncrypt() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf-8')
  } catch {
    buf = Buffer.from(json, 'utf-8')
  }
  try {
    fs.mkdirSync(path.dirname(filePath()), { recursive: true, mode: 0o700 })
    fs.writeFileSync(filePath(), buf, { mode: 0o600 })
  } catch {
    // Un fallo de disco no debe romper la sesión en memoria.
  }
}

export function getActiveId(): string | null {
  return read().activeId
}

export function getActive(): StoredAccount | null {
  const store = read()
  if (!store.activeId) return null
  return store.accounts[store.activeId] ?? null
}

export function getAccount(userId: string): StoredAccount | null {
  return read().accounts[userId] ?? null
}

/** Alta/actualización de una cuenta; la deja activa. */
export function upsertAccount(
  profile: AccountProfile,
  tokens: { accessToken: string; refreshToken: string }
): void {
  const store = read()
  store.accounts[profile.id] = { profile, ...tokens }
  store.activeId = profile.id
  write(store)
}

/** Actualiza solo los tokens (refresh) de una cuenta. */
export function updateTokens(userId: string, accessToken: string, refreshToken: string): void {
  const store = read()
  const account = store.accounts[userId]
  if (!account) return
  account.accessToken = accessToken
  account.refreshToken = refreshToken
  write(store)
}

/** Actualiza solo el snapshot de perfil. */
export function updateProfileSnapshot(profile: AccountProfile): void {
  const store = read()
  const account = store.accounts[profile.id]
  if (!account) return
  account.profile = profile
  write(store)
}

export function setActive(userId: string): boolean {
  const store = read()
  if (!store.accounts[userId]) return false
  store.activeId = userId
  write(store)
  return true
}

/** Elimina una cuenta. Devuelve el nuevo activo (o null). */
export function removeAccount(userId: string): string | null {
  const store = read()
  delete store.accounts[userId]
  if (store.activeId === userId) {
    store.activeId = Object.keys(store.accounts)[0] ?? null
  }
  write(store)
  return store.activeId
}

/** Resumen para el switcher (sin tokens). */
export function listAccountSummaries(): AccountSummary[] {
  return Object.values(read().accounts).map((account) => ({
    id: account.profile.id,
    email: account.profile.email,
    displayName: account.profile.displayName,
    handle: account.profile.handle,
    avatarUrl: account.profile.avatarUrl
  }))
}

/** Borra todo (logout total). */
export function clearAll(): void {
  write(emptyStore())
}
