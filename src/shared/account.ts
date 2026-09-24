// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Cuenta Scrakk (IDE) — contrato compartido main ⇄ preload ⇄ renderer.
 *
 * Modelo: el IDE comparte el MISMO `auth.users` que el CLI (mismo login en el
 * mismo proyecto Supabase), pero sin nada de IA. El ingreso es **igual que el
 * del CLI**: email → código OTP de 6 dígitos (enviado por la API existente con
 * Resend) → sesión. No hay contraseñas.
 *
 * Seguridad: el renderer NUNCA ve tokens ni claves. El proceso main habla con
 * la API (OTP) y con Supabase (perfil) usando solo la publishable key.
 */

export const ACCOUNT_IPC = {
  /** Pide el código OTP para el email. */
  requestCode: 'account:request-code',
  /** Verifica el código y agrega/activa la cuenta. */
  verifyCode: 'account:verify-code',
  /** Perfil de una cuenta guardada (o null si su sesión venció). */
  current: 'account:current',
  /** Guarda el perfil de una cuenta. */
  update: 'account:update',
  /** Cuentas guardadas (multi-cuenta). */
  listAccounts: 'account:list-accounts',
  /** Marca una cuenta como default (para paneles nuevos / remounts). */
  setDefault: 'account:set-default',
  /** Elimina una cuenta guardada. */
  removeAccount: 'account:remove-account'
} as const

/** Perfil público de la cuenta (mapea las columnas sociales de `public.profiles`). */
export interface AccountProfile {
  /** DNI: `auth.users.id`. */
  id: string
  email: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  gender?: string | null
  customStatus?: string | null
  customStatusEmoji?: string | null
  customStatusExpiresAt?: string | null
  createdAt?: string | null
}

export interface RequestCodeRequest {
  email: string
}

export interface VerifyCodeRequest {
  email: string
  code: string
}

export interface UpdateProfileRequest {
  displayName?: string
  handle?: string
  avatarUrl?: string
  bio?: string
  gender?: string | null
  customStatus?: string | null
  customStatusEmoji?: string | null
  customStatusExpiresAt?: string | null
}

/** Resumen de una cuenta guardada (para el switcher). */
export interface AccountSummary {
  id: string
  email: string
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
}

/** Lista de cuentas guardadas + cuál está activa. */
export interface AccountList {
  activeId: string | null
  accounts: AccountSummary[]
}

/** Resultado uniforme: nunca se lanza a través del IPC. */
export type AccountResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: AccountErrorCode }

/** Códigos estables para que la UI reaccione sin parsear mensajes. */
export type AccountErrorCode =
  | 'invalid_input'
  | 'invalid_code'
  | 'handle_taken'
  | 'rate_limited'
  | 'network'
  | 'session_expired'
  | 'api_error'
  | 'unknown'

/** API expuesta en `window.api.account`. */
export interface AccountApi {
  /** Pide el código OTP para el email (dispara el email por la API del CLI). */
  requestCode: (req: RequestCodeRequest) => Promise<AccountResult<null>>
  /** Verifica el código OTP: agrega la cuenta y devuelve su perfil. */
  verifyCode: (req: VerifyCodeRequest) => Promise<AccountResult<AccountProfile>>
  /** Perfil de una cuenta guardada (null si su sesión venció o no existe). */
  current: (accountId: string) => Promise<AccountResult<AccountProfile | null>>
  update: (accountId: string, req: UpdateProfileRequest) => Promise<AccountResult<AccountProfile>>
  /** Cuentas guardadas (multi-cuenta). */
  listAccounts: () => Promise<AccountResult<AccountList>>
  /** Marca una cuenta como default (la usan los paneles nuevos / al remontar). */
  setDefault: (accountId: string) => Promise<AccountResult<AccountList>>
  /** Elimina una cuenta guardada; devuelve la lista restante. */
  removeAccount: (accountId: string) => Promise<AccountResult<AccountList>>
}

/** Reglas de validación compartidas (la UI las usa para UX; main revalida). */
export const ACCOUNT_RULES = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  /** Código OTP de 6 dígitos (mismo formato que el CLI). */
  code: /^\d{6}$/,
  handle: /^[a-z0-9_]{3,24}$/,
  handleReserved: ['scrakk', 'admin', 'root', 'support', 'system', 'official'],
  displayNameMax: 48,
  bioMax: 160,
  /** Tope del avatar (URL http(s) o data URL de imagen). */
  avatarMaxBytes: 96_000,
  gender: ['male', 'female', 'nonbinary', 'other'] as const,
  customStatusMax: 140,
  customStatusEmojiMax: 8
} as const
