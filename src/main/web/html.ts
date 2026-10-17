// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * HTML → markdown (versión mínima del `htmd` que usa scrakk-cli).
 *
 * No pretende ser perfecto: saca script/style/nav/header/footer, conserva
 * títulos, links, listas y bloques de código, y colapsa el ruido para que el
 * modelo lea contenido útil.
 */

const DROP_BLOCKS = /<(script|style|noscript|template|svg|head|nav|footer|form|iframe)[\s\S]*?<\/\1>/gi

/**
 * `String.fromCodePoint` lanza `RangeError` con `&#99999999;` y con
 * surrogates, y ese throw abortaba el fetch entero. Una entidad inválida se
 * descarta en vez de tumbar la conversión.
 */
function safeCodePoint(value: number): string {
  if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff) return ''
  if (value >= 0xd800 && value <= 0xdfff) return ''
  return String.fromCodePoint(value)
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => safeCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => safeCodePoint(parseInt(code, 16)))
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return match ? stripTags(match[1]) : ''
}

/** Convierte el HTML principal a markdown legible. */
export function htmlToMarkdown(html: string): { title: string; content: string } {
  const title = extractTitle(html)
  let body = html.replace(DROP_BLOCKS, ' ')
  // Quedarse con el <body> si existe.
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(body)
  if (bodyMatch) body = bodyMatch[1]

  body = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<h([1-6])[^>]*>/gi, (_m, level: string) => `${'#'.repeat(Number(level))} `)
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => {
      const label = stripTags(text)
      return label ? `[${label}](${href})` : ''
    })
    .replace(/<pre[^>]*>/gi, '\n```\n')
    .replace(/<\/pre>/gi, '\n```\n')
    .replace(/<code[^>]*>/gi, '`')
    .replace(/<\/code>/gi, '`')
    .replace(/<[^>]+>/g, ' ')

  const content = decodeEntities(body)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1].length > 0))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { title, content }
}
