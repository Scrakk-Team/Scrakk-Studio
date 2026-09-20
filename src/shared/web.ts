/**
 * Módulo compartido (main + preload + renderer) — acceso a la web.
 *
 * Réplica de los tools `web_search` / `web_fetch` de scrakk-cli, pero del lado
 * del IDE: el proceso main hace el fetch (sin CORS) y aplica la protección
 * SSRF (bloquea rangos privados, link-local y metadata; permite loopback).
 */

export const WEB_IPC = {
  search: 'web:search',
  fetch: 'web:fetch'
} as const

export interface WebSearchRequest {
  query: string
  /** Dominios a los que restringir la búsqueda. */
  allowedDomains?: string[]
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export type WebSearchResponse =
  | { ok: true; query: string; results: WebSearchResult[] }
  | { ok: false; error: string }

export interface WebFetchRequest {
  url: string
}

export type WebFetchResponse =
  | {
      ok: true
      /** URL pedida. */
      url: string
      /** URL final (tras redirects). */
      finalUrl: string
      title: string
      /** Contenido en markdown/texto. */
      content: string
      /** true si se recortó por tamaño. */
      truncated: boolean
    }
  | { ok: false; error: string }

export interface WebApi {
  search: (request: WebSearchRequest) => Promise<WebSearchResponse>
  fetch: (request: WebFetchRequest) => Promise<WebFetchResponse>
}
