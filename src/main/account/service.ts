// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Servicio de cuentas (proceso main) — MULTI-CUENTA.
 *
 * Login = el MISMO flujo que el CLI: email → código OTP (la API de Scrakk lo
 * envía por Resend) → sesión Supabase. Cada cuenta tiene su propio cliente
 * Supabase (ver supabaseClient.ts), así varios paneles pueden usar cuentas
 * distintas a la vez. El renderer nunca ve tokens ni claves.
 */

import {
  ACCOUNT_RULES,
  type AccountErrorCode,
  type AccountList,
  type AccountProfile,
  type AccountResult,
  type RequestCodeRequest,
  type UpdateProfileRequest,
  type VerifyCodeRequest
} from '@shared/account'
import { API_TIMEOUT_MS, CLI_API_BASE } from './config'
import { BUILD_ID } from '../build'
import { getClientFor } from '../supabaseClient'
import {
  getAccount,
  getActiveId,
  listAccountSummaries,
  removeAccount as removeStoredAccount,
  setActive,
  updateProfileSnapshot,
  upsertAccount
} from './session'

const PROFILE_COLUMNS =
  'id,email,handle,display_name,avatar_url,bio,gender,custom_status,custom_status_emoji,custom_status_expires_at,created_at'

function fail<T>(code: AccountErrorCode, error: string): AccountResult<T> {
  return { ok: false, error, code }
}

/** Llamada JSON a la API del CLI con timeout. */
async function callCliApi<T>(
  path: string,
  body: unknown
): Promise<{ status: number; data: T | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const response = await fetch(`${CLI_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Scrakk-Client': 'ide',
        // Marca de build: si un binario se filtra, queda en los logs del server.
        'X-Scrakk-Build': BUILD_ID
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const data = (await response.json().catch(() => null)) as T | null
    return { status: response.status, data }
  } finally {
    clearTimeout(timer)
  }
}

function mapApiError(status: number, message: string | undefined): AccountErrorCode {
  if (status === 429) return 'rate_limited'
  const m = (message ?? '').toLowerCase()
  if (m.includes('código inválido') || m.includes('codigo invalido') || m.includes('expirado')) {
    return 'invalid_code'
  }
  if (m.includes('email inválido') || m.includes('email invalido') || m.includes('faltan')) {
    return 'invalid_input'
  }
  return 'api_error'
}

/** Pide el código OTP (la API del CLI envía el email con Resend). */
export async function requestCode(req: RequestCodeRequest): Promise<AccountResult<null>> {
  const email = req.email.trim().toLowerCase()
  if (!ACCOUNT_RULES.email.test(email)) return fail('invalid_input', 'Email inválido')

  try {
    const { status, data } = await callCliApi<{ ok?: boolean; error?: string; message?: string }>(
      '/auth/register',
      { email }
    )
    if (status >= 200 && status < 300 && data?.ok !== false) return { ok: true, data: null }
    return fail(mapApiError(status, data?.error), data?.error ?? 'No se pudo enviar el código')
  } catch {
    return fail('network', 'No pudimos contactar el servidor. Revisa tu conexión.')
  }
}

interface LoginResponse {
  ok?: boolean
  error?: string
  access_token?: string
  refresh_token?: string
  user?: { id: string; email: string }
}

function emptyProfile(id: string, email: string): AccountProfile {
  return { id, email, handle: null, displayName: null, avatarUrl: null, bio: null }
}

export async function verifyCode(req: VerifyCodeRequest): Promise<AccountResult<AccountProfile>> {
  const email = req.email.trim().toLowerCase()
  const code = req.code.trim()
  if (!ACCOUNT_RULES.email.test(email)) return fail('invalid_input', 'Email inválido')
  if (!ACCOUNT_RULES.code.test(code)) return fail('invalid_input', 'El código son 6 dígitos')

  let login: LoginResponse | null = null
  try {
    const { status, data } = await callCliApi<LoginResponse>('/auth/login', { email, code })
    if (status < 200 || status >= 300 || !data?.access_token || !data.refresh_token) {
      return fail(mapApiError(status, data?.error), data?.error ?? 'Código inválido o expirado')
    }
    login = data
  } catch {
    return fail('network', 'No pudimos contactar el servidor. Revisa tu conexión.')
  }

  const userId = login.user?.id
  if (!userId) return fail('unknown', 'No se pudo identificar la cuenta')

  // Guardar la cuenta (queda como default) y construir su cliente.
  upsertAccount(emptyProfile(userId, login.user?.email ?? email), {
    accessToken: login.access_token!,
    refreshToken: login.refresh_token!
  })
  const client = await getClientFor(userId)
  if (!client) return fail('unknown', 'No se pudo abrir la sesión')

  const profile = (await fetchProfile(userId)) ?? emptyProfile(userId, login.user?.email ?? email)
  updateProfileSnapshot(profile)
  return { ok: true, data: profile }
}

interface Normalized {
  displayName: string
  handle: string | null
  avatarUrl: string | null
  bio: string | null
  gender: string | null
  customStatus: string | null
  customStatusEmoji: string | null
  customStatusExpiresAt: string | null
}

function normalizeProfile(
  input: UpdateProfileRequest,
  opts: { requireName: boolean }
): { ok: true; value: Normalized } | { ok: false; code: AccountErrorCode; error: string } {
  const displayName = (input.displayName ?? '').trim()
  if (opts.requireName && displayName.length === 0) {
    return { ok: false, code: 'invalid_input', error: 'Pon tu nombre' }
  }
  if (displayName.length > ACCOUNT_RULES.displayNameMax) {
    return { ok: false, code: 'invalid_input', error: 'Nombre demasiado largo' }
  }

  let handle: string | null = null
  if (input.handle !== undefined) {
    const raw = input.handle.trim().replace(/^@/, '').toLowerCase()
    if (raw.length > 0) {
      if (!ACCOUNT_RULES.handle.test(raw)) {
        return {
          ok: false,
          code: 'invalid_input',
          error: 'El usuario: 3-24 caracteres, minúsculas, números o _'
        }
      }
      // La reserva de handles (p. ej. "scrakk") la decide la BASE, no el cliente.
      handle = raw
    }
  }

  const bio = input.bio !== undefined ? input.bio.trim() || null : null
  if (bio && bio.length > ACCOUNT_RULES.bioMax) {
    return { ok: false, code: 'invalid_input', error: 'Descripción demasiado larga' }
  }

  let avatarUrl: string | null = null
  if (input.avatarUrl !== undefined) {
    const v = input.avatarUrl.trim()
    if (v.length > 0) {
      if (v.length > ACCOUNT_RULES.avatarMaxBytes) {
        return { ok: false, code: 'invalid_input', error: 'La foto es demasiado pesada' }
      }
      if (v.startsWith('data:image/')) {
        if (!/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(v)) {
          return { ok: false, code: 'invalid_input', error: 'Formato de imagen no soportado' }
        }
      } else {
        try {
          const url = new URL(v)
          if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error()
        } catch {
          return { ok: false, code: 'invalid_input', error: 'La foto debe ser un enlace válido' }
        }
      }
      avatarUrl = v
    }
  }

  let gender: string | null = null
  if (input.gender !== undefined) {
    const g = input.gender?.trim() ?? ''
    if (g) {
      if (!(ACCOUNT_RULES.gender as readonly string[]).includes(g)) {
        return { ok: false, code: 'invalid_input', error: 'Género inválido' }
      }
      gender = g
    }
  }

  let customStatus: string | null = null
  let customStatusEmoji: string | null = null
  let customStatusExpiresAt: string | null = null
  if (input.customStatus !== undefined) {
    const cs = input.customStatus?.trim() ?? ''
    if (cs) {
      if (cs.length > ACCOUNT_RULES.customStatusMax) {
        return { ok: false, code: 'invalid_input', error: 'Estado demasiado largo' }
      }
      customStatus = cs
    }
  }
  if (input.customStatusEmoji !== undefined) {
    const ce = input.customStatusEmoji?.trim() ?? ''
    if (ce) {
      if (ce.length > ACCOUNT_RULES.customStatusEmojiMax) {
        return { ok: false, code: 'invalid_input', error: 'Emoji demasiado largo' }
      }
      customStatusEmoji = ce
    }
  }
  if (input.customStatusExpiresAt !== undefined) {
    customStatusExpiresAt = input.customStatusExpiresAt?.trim() || null
  }

  return { ok: true, value: { displayName, handle, avatarUrl, bio, gender, customStatus, customStatusEmoji, customStatusExpiresAt } }
}

async function fetchProfile(accountId: string): Promise<AccountProfile | null> {
  const client = await getClientFor(accountId)
  if (!client) return null
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', accountId)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id as string,
    email: (data.email as string) ?? '',
    handle: (data.handle as string | null) ?? null,
    displayName: (data.display_name as string | null) ?? null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
    bio: (data.bio as string | null) ?? null,
    gender: (data.gender as string | null) ?? null,
    customStatus: (data.custom_status as string | null) ?? null,
    customStatusEmoji: (data.custom_status_emoji as string | null) ?? null,
    customStatusExpiresAt: (data.custom_status_expires_at as string | null) ?? null,
    createdAt: (data.created_at as string | null) ?? null
  }
}

async function applyProfile(
  accountId: string,
  fields: Normalized
): Promise<AccountResult<AccountProfile>> {
  const client = await getClientFor(accountId)
  if (!client) return fail('session_expired', 'Tu sesión expiró. Vuelve a entrar.')
  const account = getAccount(accountId)
  const email = account?.profile.email ?? ''

  const { error: ensureErr } = await client
    .from('profiles')
    .upsert({ id: accountId, email }, { onConflict: 'id', ignoreDuplicates: true })
  if (ensureErr) return fail(mapApiError(0, ensureErr.message), ensureErr.message)

  const social: Record<string, unknown> = {}
  if (fields.displayName) social.display_name = fields.displayName
  if (fields.handle) social.handle = fields.handle
  if (fields.avatarUrl) social.avatar_url = fields.avatarUrl
  if (fields.bio) social.bio = fields.bio
  if (fields.gender) social.gender = fields.gender
  if (fields.customStatus) social.custom_status = fields.customStatus
  if (fields.customStatusEmoji) social.custom_status_emoji = fields.customStatusEmoji
  if (fields.customStatusExpiresAt) social.custom_status_expires_at = fields.customStatusExpiresAt

  if (Object.keys(social).length > 0) {
    const { error } = await client.from('profiles').update(social).eq('id', accountId)
    if (error) {
      const code = (error as { code?: string }).code
      const message = error.message ?? ''
      if (code === '23505') return fail('handle_taken', 'Ese usuario ya está tomado')
      if (message.includes('handle_reservado') || code === '23514') {
        return fail('invalid_input', 'Ese usuario está reservado')
      }
      if (message.includes('handle_invalido')) {
        return fail('invalid_input', 'El usuario: 3-24 caracteres, minúsculas, números o _')
      }
      return fail('unknown', message)
    }
  }

  const profile = await fetchProfile(accountId)
  if (!profile) return fail('unknown', 'No se pudo leer el perfil')
  updateProfileSnapshot(profile)
  return { ok: true, data: profile }
}

/** Perfil de una cuenta guardada (null si no existe). */
export async function current(accountId: string): Promise<AccountResult<AccountProfile | null>> {
  const stored = getAccount(accountId)
  if (!stored) return { ok: true, data: null }
  try {
    const profile = await fetchProfile(accountId)
    if (profile) {
      updateProfileSnapshot(profile)
      return { ok: true, data: profile }
    }
    // Fallback: si la red/sesión falló transitoriamente, usar el snapshot
    // guardado para no “perder” la cuenta al cambiar.
    return { ok: true, data: stored.profile }
  } catch {
    return { ok: true, data: stored.profile }
  }
}

export async function update(
  accountId: string,
  req: UpdateProfileRequest
): Promise<AccountResult<AccountProfile>> {
  if (!getAccount(accountId)) return fail('session_expired', 'Esa cuenta no está guardada')
  const normalized = normalizeProfile(req, { requireName: false })
  if (!normalized.ok) return fail(normalized.code, normalized.error)
  return applyProfile(accountId, normalized.value)
}

/** Cuentas guardadas + cuál es la default. */
export async function listAccounts(): Promise<AccountResult<AccountList>> {
  return { ok: true, data: { activeId: getActiveId(), accounts: listAccountSummaries() } }
}

/** Marca una cuenta como default (para paneles nuevos / remounts). */
export async function setDefault(accountId: string): Promise<AccountResult<AccountList>> {
  setActive(accountId)
  return listAccounts()
}

/** Elimina una cuenta guardada; devuelve la lista restante. */
export async function removeAccount(accountId: string): Promise<AccountResult<AccountList>> {
  removeStoredAccount(accountId)
  return listAccounts()
}
