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

/**
 * Lee como máximo `max` bytes del body.
 *
 * `arrayBuffer()` materializaba la respuesta COMPLETA antes de recortarla, así
 * que una página (o un gzip-bomb que `fetch` descomprime) de cientos de MB
 * agotaba la memoria del main durante los 25 s del timeout.
 */
async function readLimited(response: Response, max: number): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Buffer[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    const room = max - received
    if (room <= 0) {
      await reader.cancel().catch(() => undefined)
      break
    }
    if (value.byteLength > room) {
      chunks.push(Buffer.from(value.subarray(0, room)))
      received += room
      await reader.cancel().catch(() => undefined)
      break
    }
    chunks.push(Buffer.from(value))
    received += value.byteLength
  }
  return Buffer.concat(chunks)
}

import { t } from '@shared/i18n'
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
    throw new Error(t('main.url.invalida'))
  }
  // Igual que scrakk-cli: http se sube a https.
  if (url.protocol === 'http:') url.protocol = 'https:'
  if (url.protocol !== 'https:') throw new Error(t('main.solo.se.permite.http.s'))
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
      const bytes = await readLimited(response, MAX_BYTES)
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

    throw new Error(t('main.demasiados.redirects'))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
