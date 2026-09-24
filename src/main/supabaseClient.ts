// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Pool de clientes Supabase (uno por CUENTA) en el proceso main.
 *
 * Permite tener varias cuentas activas a la vez: cada panel del layout puede
 * usar una cuenta distinta. Cada cliente mantiene su propia sesión en memoria
 * (persistSession:false) y refresca sus tokens, que se guardan cifrados en el
 * store multi-cuenta.
 *
 * Nunca se usa la service_role: solo la publishable key + la sesión del usuario.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './account/config'
import { getAccount, updateTokens } from './account/session'

const clients = new Map<string, Promise<SupabaseClient>>()

function build(accountId: string): Promise<SupabaseClient> {
  const account = getAccount(accountId)
  if (!account) return Promise.reject(new Error('cuenta no guardada'))
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce'
    }
  })
  // Persistir los tokens de ESA cuenta en cada refresh/login.
  client.auth.onAuthStateChange(() => {
    setTimeout(() => {
      void (async () => {
        const { data } = await client.auth.getSession()
        if (data.session && data.session.user.id === accountId) {
          updateTokens(accountId, data.session.access_token, data.session.refresh_token)
        }
      })()
    }, 0)
  })
  return client.auth
    .setSession({ access_token: account.accessToken, refresh_token: account.refreshToken })
    .then(() => client)
}

/** Cliente autenticado de una cuenta (lo crea y le inyecta su sesión).
 *  Nunca rechaza: si la sesión guardada venció, devuelve null. */
export function getClientFor(accountId: string): Promise<SupabaseClient | null> {
  if (!getAccount(accountId)) return Promise.resolve(null)
  let pending = clients.get(accountId)
  if (!pending) {
    pending = build(accountId)
    clients.set(accountId, pending)
    pending.catch(() => clients.delete(accountId))
  }
  return pending.catch(() => null)
}

/** Descarta el cliente de una cuenta (al quitarla). */
export function dropClient(accountId: string): void {
  const pending = clients.get(accountId)
  clients.delete(accountId)
  if (!pending) return
  void pending
    .then((client) => client.auth.signOut({ scope: 'local' }))
    .catch(() => {
      /* noop */
    })
}

/** Persiste los tokens actuales de TODAS las cuentas (flush al cerrar). */
export async function flushAllTokens(): Promise<void> {
  for (const [accountId, pending] of clients) {
    try {
      const client = await pending
      const { data } = await client.auth.getSession()
      if (data.session && data.session.user.id === accountId) {
        updateTokens(accountId, data.session.access_token, data.session.refresh_token)
      }
    } catch {
      /* noop */
    }
  }
}
