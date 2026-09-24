// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo de extensión `languages` — schema del KIT de lenguaje.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN KIT Y NO TRES TIPOS
 *
 * En VS Code, "una extensión de lenguaje" son entre 5 y 15 contribution
 * points a la vez: `languages` (identidad + asociación), `grammars` (el
 * tokenizador), `snippets`, `configurationDefaults`, `semanticTokenScopes`…
 * Separarlos en SEF obligaría a que una extensión declare lo mismo tres veces
 * y a que la UI muestre tres fichas de la misma cosa.
 *
 * Aquí es UNA contribución con piezas opcionales. Cada pieza se reporta por
 * separado (color ✓, outline ✓, snippets ✗) porque una extensión de lenguaje
 * nunca es "soportada" o "no soportada" en bloque.
 *
 * Sobre la validación: aquí se valida la FORMA. Que el archivo exista se
 * verifica al registrar (leyéndolo), no con `ctx.hasModule`: `hasModule` sólo
 * conoce los módulos JS del bundle, y un `.tmLanguage`/`snippets.json` es un
 * asset — preguntarle a `hasModule` por él daba `false` y se caían TODAS las
 * gramáticas de todas las extensiones de lenguaje.
 *
 * Sobre las gramáticas: `grammars[]` es una lista heterogénea a propósito.
 *  - `kind: 'treeSitter'` → parser (wasm preferido, o .so/.dll nativo opt-in)
 *    + TODAS sus queries `.scm` (no sólo highlights: ver `queries.ts`).
 *  - `kind: 'textMate'`   → el `.tmLanguage` de una extensión de VS Code, con
 *    `embeddedLanguages` / `tokenTypes` / `injectTo`, que son el equivalente
 *    TextMate de `injections.scm` en tree-sitter.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ParseContext } from '../handler'

/** Icono del lenguaje (los dos, como VS Code). */
export interface LanguageIcon {
  light?: string
  dark?: string
}

export type GrammarKind = 'treeSitter' | 'textMate'

/** Gramática tree-sitter: parser + queries. */
export interface TreeSitterGrammar {
  kind: 'treeSitter'
  /** Ruta del parser dentro del paquete (`grammars/rust.wasm`). */
  parser: string
  /**
   * TODOS los `.scm` de la gramática. Se acepta una lista explícita porque un
   * `.sef` instalado no se puede recorrer desde el renderer: quien traduce el
   * paquete enumera el directorio (para builtin hay `queriesDir`).
   */
  queries: string[]
  /** Directorio de queries (solo builtin: el handler resuelve con glob). */
  queriesDir?: string
  /** ABI del parser (`tree-sitter-abi-14`). Se advierte si no coincide. */
  abi?: string
  /**
   * true = binario nativo (.so/.dll). Requiere proceso aislado + permiso
   * explícito del usuario, así que NO se activa solo.
   */
  native?: boolean
  /** sha256 del parser: se verifica antes de cargarlo. */
  sha256?: string
}

/** Gramática TextMate (el formato de las extensiones de VS Code). */
export interface TextMateGrammar {
  kind: 'textMate'
  scopeName: string
  path: string
  /** scope → languageId (equivalente a `injections.scm`). */
  embeddedLanguages?: Record<string, string>
  /** scope → 'string' | 'comment' | 'other' | 'regex'. */
  tokenTypes?: Record<string, string>
  /** Scopes de OTROS lenguajes en los que esta gramática se inyecta. */
  injectTo?: string[]
  /** Ver `textMateScopeMatcher`: brackets balanceados por scope. */
  balancedBracketScopes?: string[]
  unbalancedBracketScopes?: string[]
}

export type GrammarContribution = TreeSitterGrammar | TextMateGrammar

/** Snippet declarado (`snippets/rust.json`). */
export interface SnippetContribution {
  /** Ruta del archivo de snippets. */
  path: string
}

/** Mapeo de semantic tokens a scopes (lo que pinta el LSP). */
export interface SemanticTokenScopeContribution {
  language?: string
  scopes: Record<string, string[]>
}

/** Defaults de editor para el lenguaje (`editor.tabSize`…). */
export type ConfigurationDefaults = Record<string, unknown>

export interface LanguageContribution {
  /** Language id (ej. 'rust'). */
  id: string
  /** Nombres legibles (el primero es la etiqueta). */
  aliases?: string[]
  /** Extensiones de archivo ('.rs'). */
  extensions?: string[]
  /** Nombres exactos ('Cargo.toml'). */
  filenames?: string[]
  /** Patrones glob sobre el nombre del archivo (ver `globToRegExp`). */
  filenamePatterns?: string[]
  /** Regex para detectar por primera línea (shebang). */
  firstLine?: string
  /** Ruta del `language-configuration.json`. */
  configuration?: string
  icon?: LanguageIcon
  grammars?: GrammarContribution[]
  snippets?: SnippetContribution[]
  semanticTokenScopes?: SemanticTokenScopeContribution[]
  configurationDefaults?: ConfigurationDefaults
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') out[key] = item
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function parseTreeSitter(raw: Record<string, unknown>): TreeSitterGrammar | null {
  if (typeof raw.parser !== 'string' || raw.parser.length === 0) return null
  const queries = asStringArray(raw.queries)
  const queriesDir = typeof raw.queriesDir === 'string' ? raw.queriesDir : undefined
  return {
    kind: 'treeSitter',
    parser: raw.parser,
    queries,
    queriesDir,
    abi: typeof raw.abi === 'string' ? raw.abi : undefined,
    native: raw.native === true,
    sha256: typeof raw.sha256 === 'string' ? raw.sha256 : undefined
  }
}

function parseTextMate(raw: Record<string, unknown>): TextMateGrammar | null {
  if (typeof raw.scopeName !== 'string' || typeof raw.path !== 'string') return null
  return {
    kind: 'textMate',
    scopeName: raw.scopeName,
    path: raw.path,
    embeddedLanguages: asStringRecord(raw.embeddedLanguages),
    tokenTypes: asStringRecord(raw.tokenTypes),
    injectTo: Array.isArray(raw.injectTo) ? asStringArray(raw.injectTo) : undefined,
    balancedBracketScopes: Array.isArray(raw.balancedBracketScopes)
      ? asStringArray(raw.balancedBracketScopes)
      : undefined,
    unbalancedBracketScopes: Array.isArray(raw.unbalancedBracketScopes)
      ? asStringArray(raw.unbalancedBracketScopes)
      : undefined
  }
}

function parseGrammars(raw: unknown): GrammarContribution[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: GrammarContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const kind = record.kind
    const grammar =
      kind === 'treeSitter'
        ? parseTreeSitter(record)
        : kind === 'textMate'
          ? parseTextMate(record)
          : null
    if (grammar) out.push(grammar)
  }
  return out.length > 0 ? out : undefined
}

function parseLanguage(raw: unknown): LanguageContribution | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id.length === 0) return null

  const snippets = Array.isArray(record.snippets)
    ? record.snippets.flatMap((item): SnippetContribution[] => {
        if (!item || typeof item !== 'object') return []
        const path = (item as Record<string, unknown>).path
        return typeof path === 'string' ? [{ path }] : []
      })
    : undefined

  const semanticTokenScopes = Array.isArray(record.semanticTokenScopes)
    ? record.semanticTokenScopes.flatMap((item): SemanticTokenScopeContribution[] => {
        if (!item || typeof item !== 'object') return []
        const entry = item as Record<string, unknown>
        const scopes = asStringRecordArray(entry.scopes)
        if (!scopes) return []
        return [
          {
            language: typeof entry.language === 'string' ? entry.language : undefined,
            scopes
          }
        ]
      })
    : undefined

  const icon = record.icon as LanguageIcon | undefined

  return {
    id: record.id,
    aliases: asStringArray(record.aliases),
    extensions: asStringArray(record.extensions),
    filenames: asStringArray(record.filenames),
    filenamePatterns: asStringArray(record.filenamePatterns),
    firstLine: typeof record.firstLine === 'string' ? record.firstLine : undefined,
    configuration: typeof record.configuration === 'string' ? record.configuration : undefined,
    icon: icon && (icon.light || icon.dark) ? { light: icon.light, dark: icon.dark } : undefined,
    grammars: parseGrammars(record.grammars),
    snippets: snippets && snippets.length > 0 ? snippets : undefined,
    semanticTokenScopes: semanticTokenScopes && semanticTokenScopes.length > 0 ? semanticTokenScopes : undefined,
    configurationDefaults:
      record.configurationDefaults && typeof record.configurationDefaults === 'object'
        ? (record.configurationDefaults as ConfigurationDefaults)
        : undefined
  }
}

/** `Record<string, string[]>` (el de semanticTokenScopes, no el de a uno). */
function asStringRecordArray(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, string[]> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const list = asStringArray(item)
    if (list.length > 0) out[key] = list
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Normaliza el slice `contributes.languages` del manifest.
 *
 * Acepta un objeto o un array (VS Code acepta `configuration` como objeto o
 * como lista, y queremos tolerar las dos formas al traducir).
 */
export function parseLanguagesContribution(
  raw: unknown,
  // El contexto se recibe por contrato del handler, pero este tipo NO valida
  // existencia de archivos aquí (ver la nota de arriba sobre `hasModule`).
  _ctx?: ParseContext
): LanguageContribution[] | null {
  const items = Array.isArray(raw) ? raw : [raw]
  const out: LanguageContribution[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const parsed = parseLanguage(item)
    if (!parsed) continue
    if (seen.has(parsed.id)) continue
    seen.add(parsed.id)
    out.push(parsed)
  }
  return out.length > 0 ? out : null
}
