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

import { t } from '@shared/i18n'
const clients = new Map<string, Promise<SupabaseClient>>()

function build(accountId: string): Promise<SupabaseClient> {
  const account = getAccount(accountId)
  if (!account) return Promise.reject(new Error(t('main.cuenta.no.guardada')))
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
    .then(async ({ error }) => {
      if (!error) return client
      // `setSession` NO rechaza cuando falla: devuelve `{ error }`. Al ignorarlo,
      // el cliente quedaba SIN sesión (rol `anon`) y todo lo que escribía moría
      // con 42501 `permission denied for table messages`, mentido como un
      // problema de permisos del usuario. El access token pudo vencer y el
      // refresh token seguir siendo válido, así que se intenta refrescar.
      const { error: refreshError } = await client.auth.refreshSession()
      if (!refreshError) return client
      // Última red: si después de los intentos NO hay sesión, NUNCA se devuelve
      // el cliente (sería un cliente anónimo que envenena cada llamada). Se
      // rechaza y `getClientFor` devuelve null → la UI pide iniciar sesión.
      const { data } = await client.auth.getSession()
      if (data.session) return client
      throw new Error(`session_invalid: ${refreshError.message || error.message}`)
    })
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
  return pending.then((client) => ensureSession(client, accountId)).catch(() => null)
}

/**
 * Garantiza que el cliente tenga la sesión GUARDADA.
 *
 * `getClientFor` cachea el cliente por cuenta, y el LOGIN (`verifyCode`) guarda
 * tokens NUEVOS sin tocar ese cache. Consecuencia: después de iniciar sesión
 * seguías usando el cliente de antes (sin sesión → rol `anon`), y cada INSERT
 * moría con 42501 `permission denied for table messages` **justo después de un
 * login exitoso** (se veía como "sin permiso", y antes como "solo puedes
 * escribirle a tus amigos"). En los logs: sesión creada 01:26:42, INSERT
 * rechazado 01:26:47.
 *
 * Se reusa el MISMO cliente inyectándole los tokens nuevos, en vez de
 * reconstruirlo, para no perder los canales de Realtime ya suscritos.
 */
async function ensureSession(
  client: SupabaseClient,
  accountId: string
): Promise<SupabaseClient | null> {
  const { data } = await client.auth.getSession()
  if (data.session) return client
  const account = getAccount(accountId)
  if (!account) return null
  const { error } = await client.auth.setSession({
    access_token: account.accessToken,
    refresh_token: account.refreshToken
  })
  if (!error) return client
  const { error: refreshError } = await client.auth.refreshSession()
  if (!refreshError) return client
  // Sin sesión tras los dos intentos: se descarta el cliente en vez de
  // entregarlo anónimo (cada request suya saldría sin JWT → 42501).
  //
  // OJO con el texto del error: supabase-js usa "Auth session missing!" para
  // `AuthSessionMissingError`, que NO matchea /invalid|expired/. Por eso acá no
  // se clasifica el error: se comprueba el hecho (¿hay sesión o no?).
  const { data: after } = await client.auth.getSession()
  if (after.session) return client
  clients.delete(accountId)
  return null
}

/** Descarta el cliente de una cuenta (al quitarla). */
export function dropClient(accountId: string): void {
  const pending = clients.get(accountId)
  clients.delete(accountId)
  if (!pending) return
  // `global` revoca el refresh token en el servidor: con `local` una copia
  // previa del token seguía siendo válida después de quitar la cuenta.
  void pending
    .then((client) => client.auth.signOut({ scope: 'global' }))
    .catch(() => {
      /* noop */
    })
}

/**
 * Saca el cliente del pool **sin** cerrar su sesión.
 *
 * `dropClient` además hace `signOut`, y ese mismo objeto puede estar en manos
 * de una operación en vuelo (un INSERT, un poll): al firmarlo, esa request sale
 * sin JWT → `auth.uid()` es NULL → la RLS rechaza con 42501, y el chat muestra
 * "solo puedes escribirle a tus amigos" aunque sí seas amigo (42501 es el
 * código de CUALQUIER falta de permiso, no solo el de la amistad).
 *
 * Para reconstruir no hace falta cerrar nada: el próximo `getClientFor` arma un
 * cliente nuevo desde los tokens guardados, que siguen intactos.
 */
export function forgetClient(accountId: string): void {
  clients.delete(accountId)
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
