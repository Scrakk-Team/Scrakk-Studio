// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Saneado de iconos SVG inline.
 *
 * Los iconos de una extensión se pintan con `dangerouslySetInnerHTML` en la
 * ActivityBar/ToolDock. Un SVG es HTML: `<svg onload=…>`, `<script>`,
 * `<foreignObject>` o `href="javascript:…"` se ejecutan en el origen del IDE
 * (con acceso a `window.api`), sin necesidad de que la extensión traiga un
 * bundle. Se eliminan los vectores activos y, si queda algo raro, se descarta
 * el icono entero en vez de arriesgar.
 *
 * No sustituye a un sanitizador DOM (DOMPurify); es una allowlist conservadora
 * para un caso acotado: un icono no necesita scripts, estilos ni links.
 */

/** Elementos con contenido (se borra el bloque completo, anidados incluidos). */
const DANGEROUS_BLOCKS =
  /<\s*(script|style|foreignObject|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\/\s*\1\s*>|<\s*(script|style|foreignObject|iframe|object|embed|link|meta)\b[^>]*\/?>/gi
/** Elementos vacíos que pueden cargar/animar recursos externos. */
const DANGEROUS_VOID =
  /<\s*(use|image|animate|animateMotion|animateTransform|set|handler)\b[^>]*\/?>/gi

const EVENT_ATTR = /\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
const STYLE_ATTR = /\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
/** `href`/`xlink:href`/`src` externos; se conservan solo los `#fragment`. */
const LINK_ATTR =
  /\s+(?:xlink:href|href|src)\s*=\s*(?:"(?!#)[^"]*"|'(?!#)[^']*'|(?!"|')[^\s>]+)/gi
const ANCHOR_TAG = /<\/?a\b[^>]*>/gi

export function sanitizeSvgIcon(input: string | undefined): string | undefined {
  if (!input || typeof input !== 'string') return undefined
  let svg = input.trim()
  if (!/^<svg[\s>]/i.test(svg)) return undefined

  svg = svg
    .replace(DANGEROUS_BLOCKS, '')
    .replace(DANGEROUS_VOID, '')
    .replace(ANCHOR_TAG, '')
    .replace(EVENT_ATTR, '')
    .replace(STYLE_ATTR, '')
    .replace(LINK_ATTR, '')

  // Un `url(…)` externo restante (fill, filter, mask…) dispara una request.
  if (/\burl\s*\(\s*['"]?\s*(?!#)/i.test(svg)) return undefined
  // Si tras limpiar quedó una etiqueta activa, no se intenta adivinar.
  if (/<\s*(script|foreignObject|iframe|object|embed)\b/i.test(svg)) return undefined

  return svg
}
