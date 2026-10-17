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
  type AcceptLegalRequest,
  type AccountErrorCode,
  type AccountList,
  type AccountProfile,
  type AccountResult,
  type RequestCodeRequest,
  type UpdateProfileRequest,
  type VerifyCodeRequest
} from '@shared/account'
import type { LegalConsent } from '@shared/legal'
import type { SupabaseClient } from '@supabase/supabase-js'
import { API_TIMEOUT_MS, CLI_API_BASE } from './config'
import { BUILD_ID } from '../build'
import { getClientFor, forgetClient } from '../supabaseClient'
import {
  getAccount,
  getActiveId,
  listAccountSummaries,
  removeAccount as removeStoredAccount,
  setActive,
  updateProfileSnapshot,
  upsertAccount
} from './session'

import { t } from '@shared/i18n'
import { AttemptLimiter } from './rateLimit'
// Barreras locales del OTP (la API externa debe tener las suyas).
const OTP_COOLDOWN_MS = 60_000
const OTP_HOURLY_LIMIT = 5
const OTP_VERIFY_WINDOW_MS = 15 * 60_000
const OTP_VERIFY_LIMIT = 5
const requestCooldown = new AttemptLimiter()
const requestQuota = new AttemptLimiter()
const verifyLimiter = new AttemptLimiter()

const PROFILE_COLUMNS =
  'id,email,handle,display_name,avatar_url,bio,verified,gender,custom_status,custom_status_emoji,custom_status_expires_at,created_at'

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
  if (!ACCOUNT_RULES.email.test(email)) return fail('invalid_input', t('main.email.invalido'))

  const key = `send:${email}`
  const cooldown = requestCooldown.hit(key, 1, OTP_COOLDOWN_MS)
  if (!cooldown.allowed) {
    return fail(
      'rate_limited',
      t('main.otp.espera', { seconds: Math.ceil(cooldown.retryAfterMs / 1000) })
    )
  }
  const quota = requestQuota.hit(key, OTP_HOURLY_LIMIT, 60 * 60_000)
  if (!quota.allowed) {
    return fail(
      'rate_limited',
      t('main.otp.demasiados.intentos', { minutes: Math.ceil(quota.retryAfterMs / 60_000) })
    )
  }

  try {
    const { status, data } = await callCliApi<{ ok?: boolean; error?: string; message?: string }>(
      '/auth/register',
      { email }
    )
    if (status >= 200 && status < 300 && data?.ok !== false) return { ok: true, data: null }
    return fail(mapApiError(status, data?.error), data?.error ?? t('main.no.se.pudo.enviar.el'))
  } catch {
    return fail('network', t('main.no.pudimos.contactar.el.servidor'))
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
  return { id, email, handle: null, displayName: null, avatarUrl: null, bio: null, verified: false }
}

/**
 * Registra la aceptación de términos en el servidor. La marca de tiempo la
 * pone Postgres (`now()`), así la prueba no depende del reloj del cliente.
 */
async function writeLegalConsent(client: SupabaseClient, consent: LegalConsent): Promise<boolean> {
  const { error } = await client.rpc('accept_legal', {
    p_version: consent.version,
    p_locale: consent.locale
  })
  if (error) {
    console.warn('[account] no se pudo registrar la aceptación legal:', error.message)
    return false
  }
  return true
}

export async function verifyCode(req: VerifyCodeRequest): Promise<AccountResult<AccountProfile>> {
  const email = req.email.trim().toLowerCase()
  const code = req.code.trim()
  if (!ACCOUNT_RULES.email.test(email)) return fail('invalid_input', t('main.email.invalido'))
  if (!ACCOUNT_RULES.code.test(code)) return fail('invalid_input', t('main.el.codigo.son.6.digitos'))

  const attempt = verifyLimiter.hit(`verify:${email}`, OTP_VERIFY_LIMIT, OTP_VERIFY_WINDOW_MS)
  if (!attempt.allowed) {
    return fail(
      'rate_limited',
      t('main.otp.demasiados.intentos', { minutes: Math.ceil(attempt.retryAfterMs / 60_000) })
    )
  }

  let login: LoginResponse | null = null
  try {
    const { status, data } = await callCliApi<LoginResponse>('/auth/login', { email, code })
    if (status < 200 || status >= 300 || !data?.access_token || !data.refresh_token) {
      return fail(mapApiError(status, data?.error), data?.error ?? t('main.codigo.invalido.o.expirado'))
    }
    login = data
  } catch {
    return fail('network', t('main.no.pudimos.contactar.el.servidor'))
  }

  const userId = login.user?.id
  if (!userId) return fail('unknown', t('main.no.se.pudo.identificar.la'))

  // Guardar la cuenta (queda como default) y construir su cliente.
  upsertAccount(emptyProfile(userId, login.user?.email ?? email), {
    accessToken: login.access_token!,
    refreshToken: login.refresh_token!
  })
  // Clave: el cliente de esta cuenta se cachea por id, así que hay que sacar el
  // viejo (o inyectarle los tokens nuevos) ANTES de usarlo. Sin esto, el login
  // guardaba tokens nuevos pero se seguía usando el cliente anónimo previo, y
  // cada envío fallaba con 42501 "permission denied" — logueado y todo.
  forgetClient(userId)
  const client = await getClientFor(userId)
  if (!client) return fail('unknown', t('main.no.se.pudo.abrir.la'))

  const profile = (await fetchProfile(userId)) ?? emptyProfile(userId, login.user?.email ?? email)
  updateProfileSnapshot(profile)
  verifyLimiter.reset(`verify:${email}`)
  // Aceptación de términos capturada en el signup: se registra server-side.
  if (req.consent) await writeLegalConsent(client, req.consent)
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
    return { ok: false, code: 'invalid_input', error: t('main.pon.tu.nombre') }
  }
  if (displayName.length > ACCOUNT_RULES.displayNameMax) {
    return { ok: false, code: 'invalid_input', error: t('main.nombre.demasiado.largo') }
  }

  let handle: string | null = null
  if (input.handle !== undefined) {
    const raw = input.handle.trim().replace(/^@/, '').toLowerCase()
    if (raw.length > 0) {
      if (!ACCOUNT_RULES.handle.test(raw)) {
        return {
          ok: false,
          code: 'invalid_input',
          error: t('main.el.usuario.3.24.caracteres')
        }
      }
      // La reserva de handles (p. ej. "scrakk") la decide la BASE, no el cliente.
      handle = raw
    }
  }

  const bio = input.bio !== undefined ? input.bio.trim() || null : null
  if (bio && bio.length > ACCOUNT_RULES.bioMax) {
    return { ok: false, code: 'invalid_input', error: t('main.descripcion.demasiado.larga') }
  }

  let avatarUrl: string | null = null
  if (input.avatarUrl !== undefined) {
    const v = input.avatarUrl.trim()
    if (v.length > 0) {
      if (v.length > ACCOUNT_RULES.avatarMaxBytes) {
        return { ok: false, code: 'invalid_input', error: t('main.la.foto.es.demasiado.pesada') }
      }
      if (v.startsWith('data:image/')) {
        if (!/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(v)) {
          return { ok: false, code: 'invalid_input', error: t('main.formato.de.imagen.no.soportado') }
        }
      } else {
        try {
          const url = new URL(v)
          if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error()
        } catch {
          return { ok: false, code: 'invalid_input', error: t('main.la.foto.debe.ser.un') }
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
        return { ok: false, code: 'invalid_input', error: t('main.genero.invalido') }
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
        return { ok: false, code: 'invalid_input', error: t('main.estado.demasiado.largo') }
      }
      customStatus = cs
    }
  }
  if (input.customStatusEmoji !== undefined) {
    const ce = input.customStatusEmoji?.trim() ?? ''
    if (ce) {
      if (ce.length > ACCOUNT_RULES.customStatusEmojiMax) {
        return { ok: false, code: 'invalid_input', error: t('main.emoji.demasiado.largo') }
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
    verified: data.verified === true,
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
  if (!client) return fail('session_expired', t('main.tu.sesion.expiro.vuelve.a'))
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
      if (code === '23505') return fail('handle_taken', t('main.ese.usuario.ya.esta.tomado'))
      if (message.includes('handle_reservado') || code === '23514') {
        return fail('invalid_input', t('main.ese.usuario.esta.reservado'))
      }
      if (message.includes('handle_invalido')) {
        return fail('invalid_input', t('main.el.usuario.3.24.caracteres'))
      }
      return fail('unknown', message)
    }
  }

  const profile = await fetchProfile(accountId)
  if (!profile) return fail('unknown', t('main.no.se.pudo.leer.el'))
  updateProfileSnapshot(profile)
  return { ok: true, data: profile }
}

/** Perfil de una cuenta guardada (null si no existe). */
export async function current(accountId: string): Promise<AccountResult<AccountProfile | null>> {
  const stored = getAccount(accountId)
  if (!stored) return { ok: true, data: null }
  // La sesión guardada no se pudo rearmar (refresh token revocado/rotado): NO
  // se simula "logueado" con el snapshot local. Antes el `catch` de abajo
  // devolvía el perfil cacheado y la app parecía logueada mientras TODA
  // escritura fallaba con 42501 (el chat lo mostraba como "sin permiso" o
  // "solo puedes escribirle a tus amigos"). Devolver null manda a la UI al
  // login, que es lo único que puede arreglarlo.
  const client = await getClientFor(accountId)
  if (!client) return { ok: true, data: null }
  try {
    const profile = await fetchProfile(accountId)
    if (profile) {
      updateProfileSnapshot(profile)
      return { ok: true, data: profile }
    }
    // Fallback: si la red falló transitoriamente, usar el snapshot guardado
    // para no “perder” la cuenta al cambiar.
    return { ok: true, data: stored.profile }
  } catch {
    return { ok: true, data: stored.profile }
  }
}

export async function update(
  accountId: string,
  req: UpdateProfileRequest
): Promise<AccountResult<AccountProfile>> {
  if (!getAccount(accountId)) return fail('session_expired', t('main.esa.cuenta.no.esta.guardada'))
  const normalized = normalizeProfile(req, { requireName: false })
  if (!normalized.ok) return fail(normalized.code, normalized.error)
  return applyProfile(accountId, normalized.value)
}

/** Registra (o renueva) la aceptación de términos de una cuenta ya iniciada. */
export async function acceptLegal(req: AcceptLegalRequest): Promise<AccountResult<null>> {
  const client = await getClientFor(req.accountId)
  if (!client) return fail('session_expired', t('main.tu.sesion.expiro.vuelve.a'))
  if (!(await writeLegalConsent(client, req.consent))) {
    return fail('unknown', t('main.no.se.pudo.registrar.la.aceptacion'))
  }
  return { ok: true, data: null }
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
