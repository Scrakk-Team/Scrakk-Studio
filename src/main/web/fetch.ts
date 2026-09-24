// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * `web_fetch` (proceso main) — trae una URL y la devuelve como markdown.
 *
 * Mismo comportamiento que el `web_fetch` de scrakk-cli:
 *  - HTTP se sube a HTTPS.
 *  - Protección SSRF en cada salto de redirect.
 *  - Prefiere `text/markdown` en el Accept (los sitios de docs lo sirven).
 *  - Recorta páginas largas.
 */

import type { WebFetchResponse } from '@shared/web'
import { assertPublicHost } from './ssrf'
import { htmlToMarkdown } from './html'

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'

const MAX_REDIRECTS = 5
const MAX_BYTES = 2_000_000
const MAX_CHARS = 30_000
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

function normalizeUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('URL inválida')
  }
  // Igual que scrakk-cli: http se sube a https.
  if (url.protocol === 'http:') url.protocol = 'https:'
  if (url.protocol !== 'https:') throw new Error('Solo se permite http(s)')
  return url
}

export async function fetchUrl(rawUrl: string): Promise<WebFetchResponse> {
  try {
    let current = normalizeUrl(rawUrl)

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(current.hostname)

      const response = await fetch(current.toString(), {
        headers: {
          'User-Agent': UA,
          Accept: 'text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.5'
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(25_000)
      })

      if (REDIRECT_STATUS.has(response.status)) {
        const location = response.headers.get('location')
        if (!location) throw new Error(`Redirect sin destino (${response.status})`)
        current = normalizeUrl(new URL(location, current).toString())
        continue
      }

      if (!response.ok) throw new Error(`El sitio respondió ${response.status}`)

      const contentType = response.headers.get('content-type') ?? ''
      const bytes = Buffer.from(await response.arrayBuffer()).subarray(0, MAX_BYTES)
      const text = new TextDecoder('utf-8').decode(bytes)

      let title = ''
      let content: string
      if (/text\/markdown|text\/plain/i.test(contentType)) {
        content = text.trim()
      } else {
        const converted = htmlToMarkdown(text)
        title = converted.title
        content = converted.content
      }

      let truncated = false
      if (content.length > MAX_CHARS) {
        content = content.slice(0, MAX_CHARS)
        truncated = true
      }

      return { ok: true, url: rawUrl, finalUrl: response.url || current.toString(), title, content, truncated }
    }

    throw new Error('Demasiados redirects')
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
