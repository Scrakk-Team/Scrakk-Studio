// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * `web_search` (proceso main) — búsqueda web real sin API key.
 *
 * Usa el endpoint HTML de DuckDuckGo (mismo espíritu que el `web_search` de
 * scrakk-cli: query + dominios permitidos → resultados con título, URL y
 * snippet). No hay CORS porque corre en el main.
 */

import type { WebSearchRequest, WebSearchResult } from '@shared/web'

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Los href de DDG vienen como `//duckduckgo.com/l/?uddg=<url>`; se resuelve. */
function resolveResultUrl(href: string): string {
  try {
    const url = new URL(href.startsWith('//') ? `https:${href}` : href)
    const uddg = url.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    return url.toString()
  } catch {
    return href
  }
}

async function requestResults(query: string): Promise<WebSearchResult[]> {
  const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(20_000)
  })
  if (!response.ok) throw new Error(`La búsqueda respondió ${response.status}`)
  const html = await response.text()

  const snippets: string[] = []
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
  let snippetMatch: RegExpExecArray | null
  while ((snippetMatch = snippetRe.exec(html)) !== null) snippets.push(stripTags(snippetMatch[1]))

  const results: WebSearchResult[] = []
  const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let linkMatch: RegExpExecArray | null
  let index = 0
  while ((linkMatch = linkRe.exec(html)) !== null) {
    const url = resolveResultUrl(linkMatch[1])
    const title = stripTags(linkMatch[2])
    const snippet = snippets[index] ?? ''
    index++
    if (!title || !/^https?:\/\//i.test(url)) continue
    results.push({ title, url, snippet })
    if (results.length >= 10) break
  }
  return results
}

function matchesDomains(result: WebSearchResult, domains: string[]): boolean {
  try {
    const host = new URL(result.url).hostname
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
  } catch {
    return false
  }
}

/** Ejecuta la búsqueda y devuelve hasta 10 resultados. */
export async function searchWeb(request: WebSearchRequest): Promise<WebSearchResult[]> {
  const query = request.query.trim()
  if (!query) throw new Error('Falta la consulta')
  const domains = (request.allowedDomains ?? []).map((d) => d.trim()).filter(Boolean)
  const siteFilter = domains.length > 0 ? ` ${domains.map((d) => `site:${d}`).join(' OR ')}` : ''
  const results = await requestResults(`${query}${siteFilter}`)
  if (domains.length === 0) return results
  // Si DDG no aplicó el filtro, se filtra igual por dominio.
  return results.filter((result) => matchesDomains(result, domains))
}
