/**
 * Config del backend de cuentas (Scrakk ⇄ Supabase).
 *
 * Estas dos constantes son PÚBLICAS por diseño (publishable key): no dan acceso
 * a datos — solo habilitan GoTrue (auth) y lo que las políticas RLS permitan.
 * La `service_role` NUNCA vive en el IDE (sería una vulnerabilidad crítica).
 *
 * Se puede overridear por entorno (útil en tests / self-host).
 */
export const SUPABASE_URL =
  process.env.SCRAKK_SUPABASE_URL ?? 'https://ufcwwigmzgmyyfauymim.supabase.co'

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.SCRAKK_SUPABASE_KEY ?? 'sb_publishable_l3U5_bv_76IH3EPrffeK6g_YC9a1wzc'

/**
 * Base de la API del CLI (Cloudflare Pages). El IDE reutiliza su flujo de
 * login OTP por email (Resend): `/auth/register` manda el código y
 * `/auth/login` lo verifica y devuelve la sesión. Es la MISMA cuenta: no se
 * toca ni se duplica el sistema de login.
 */
export const CLI_API_BASE = process.env.SCRAKK_API_BASE ?? 'https://api.scrakk.art/api'

/** Timeout de las llamadas HTTP a la API. */
export const API_TIMEOUT_MS = 20_000

