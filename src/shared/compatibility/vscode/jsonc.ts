// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * JSONC mínimo para themes de VS Code (port de scrakk parseJsonc.ts).
 * Los temas reales traen line/block comments + trailing commas.
 */

function stripComments(src: string): string {
  let out = ''
  let i = 0
  let inString = false
  let escape = false
  while (i < src.length) {
    const ch = src[i]
    const next = src[i + 1]
    if (inString) {
      out += ch
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      i++
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      i++
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    out += ch
    i++
  }
  return out
}

function stripTrailingCommas(src: string): string {
  return src.replace(/,(\s*[}\]])/g, '$1')
}

export function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // Fallback: sin comentarios ni trailing commas.
  }
  const cleaned = stripTrailingCommas(stripComments(text.replace(/^\uFEFF/, '')))
  return JSON.parse(cleaned)
}
