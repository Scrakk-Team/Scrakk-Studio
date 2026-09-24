// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Parser mínimo de frontmatter YAML para `SKILL.md`.
 *
 * Soporta las claves del estándar Agent Skills (`name`, `description`,
 * `license`, `compatibility`, `metadata`) con valores simples y ESCALARES DE
 * BLOQUE (`>` plegado y `|` literal, con chomping `-`/`+`). No es un YAML
 * completo a propósito: el formato de skill es plano y tolerante.
 */

export interface SkillFrontmatter {
  name?: string
  description?: string
  license?: string
  compatibility?: string
  /** Claves extra (metadata, allowed-tools, …) tal cual, sin interpretar. */
  extra: Record<string, string>
}

export interface ParsedSkillFile {
  frontmatter: SkillFrontmatter
  /** Cuerpo markdown (sin el bloque de frontmatter). */
  body: string
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** Colapsa saltos/espacios: el frontmatter se usa en una línea (tooltips, listas). */
function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

interface BlockIndicator {
  style: '>' | '|'
  chomp: '' | '-' | '+'
  explicitIndent: number
}

/** Detecta `>`, `|`, `>-`, `|+`, `>2`, etc. */
function parseBlockIndicator(value: string): BlockIndicator | null {
  const match = /^([>|])([+-]?)(\d*)$/.exec(value.trim())
  if (!match) return null
  return {
    style: match[1] as '>' | '|',
    chomp: (match[2] as '' | '-' | '+') ?? '',
    explicitIndent: match[3] ? Number(match[3]) : 0
  }
}

/**
 * Consume las líneas de un escalar de bloque desde `startIndex`.
 * Devuelve el valor normalizado y el índice de la próxima línea no consumida.
 */
function readBlockScalar(
  lines: string[],
  startIndex: number,
  parentIndent: number,
  indicator: BlockIndicator
): { value: string; nextIndex: number } {
  const raw: string[] = []
  let blockIndent: number | null =
    indicator.explicitIndent > 0 ? parentIndent + indicator.explicitIndent : null
  let index = startIndex

  for (; index < lines.length; index++) {
    const line = lines[index]
    if (line.trim() === '') {
      raw.push('')
      continue
    }
    const indent = (line.match(/^\s*/)?.[0] ?? '').length
    if (indent <= parentIndent) break
    if (blockIndent === null) blockIndent = indent
    raw.push(line.slice(Math.min(blockIndent, indent)))
  }

  // Sacar líneas en blanco iniciales (no son contenido en YAML).
  while (raw.length > 0 && raw[0] === '') raw.shift()
  // Chomping.
  while (raw.length > 0 && raw[raw.length - 1] === '') {
    if (indicator.chomp === '+') break
    raw.pop()
  }

  let value: string
  if (indicator.style === '|') {
    value = raw.join('\n')
  } else {
    // Plegado: un salto entre líneas no vacías es un espacio; los vacíos
    // conservan un salto.
    const parts: string[] = []
    for (let i = 0; i < raw.length; i++) {
      const line = raw[i]
      if (line === '') {
        parts.push('\n')
      } else if (i > 0 && raw[i - 1] !== '') {
        parts.push(' ', line)
      } else {
        parts.push(line)
      }
    }
    value = parts.join('')
  }
  if (indicator.chomp !== '-') {
    value = value.replace(/\n*$/, '\n')
  } else {
    value = value.replace(/\n+$/, '')
  }
  return { value: collapse(value), nextIndex: index }
}

/** Parsea `SKILL.md` → frontmatter + cuerpo. Tolerante: nunca lanza. */
export function parseSkillFile(text: string): ParsedSkillFile {
  const normalized = text.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---')) {
    return { frontmatter: { extra: {} }, body: normalized.trim() }
  }
  const end = normalized.indexOf('\n---', 3)
  if (end === -1) {
    return { frontmatter: { extra: {} }, body: normalized.trim() }
  }
  const rawHeader = normalized.slice(3, end)
  const body = normalized.slice(normalized.indexOf('\n', end + 1) + 1).trim()

  const frontmatter: SkillFrontmatter = { extra: {} }
  const lines = rawHeader.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const colon = trimmed.indexOf(':')
    if (colon <= 0) continue

    const indent = (line.match(/^\s*/)?.[0] ?? '').length
    const key = trimmed.slice(0, colon).trim().toLowerCase()
    const rawValue = trimmed.slice(colon + 1).trim()

    // Escalar de bloque (`>` / `|`): consumir las líneas indentadas que siguen.
    const indicator = parseBlockIndicator(rawValue)
    let value: string
    if (indicator) {
      const result = readBlockScalar(lines, i + 1, indent, indicator)
      value = result.value
      i = result.nextIndex - 1
    } else {
      value = collapse(unquote(rawValue))
    }
    if (!value) continue

    if (key === 'name') frontmatter.name = value
    else if (key === 'description') frontmatter.description = value
    else if (key === 'license') frontmatter.license = value
    else if (key === 'compatibility') frontmatter.compatibility = value
    else frontmatter.extra[key] = value
  }

  return { frontmatter, body }
}
