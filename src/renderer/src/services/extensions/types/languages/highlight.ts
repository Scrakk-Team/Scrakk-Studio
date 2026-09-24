// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Resaltado con la gramática de una extensión de lenguaje.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DE DÓNDE VIENE ESTO
 *
 * Una extensión de lenguaje de VS Code trae un `.tmLanguage` (TextMate): la
 * gramática que dice qué es comentario, string, keyword. El motor del editor
 * (Innerta) tiene 20 gramáticas tree-sitter compiladas, así que un lenguaje que
 * NO es uno de esos 20 no se colorea solo — y ahí es donde entra la extensión.
 *
 * La cadena completa:
 *
 *   1. `LanguageRegistry` (renderer) resuelve el lenguaje del archivo y sus
 *      gramáticas declaradas.
 *   2. El paquete instalado vive en disco: se resuelve la ruta ABSOLUTA.
 *   3. El MAIN tokeniza (ahí están los archivos y el `.wasm` de Oniguruma) y
 *      devuelve SCOPES, no colores.
 *   4. Aquí se resuelve cada stack de scopes a un SLOT del tema (el mismo
 *      resolutor que usan los captures de tree-sitter, ver `legend.ts`).
 *   5. El resultado es una lista de tokens que el puente del editor fusiona con
 *      las demás fuentes y empuja al motor.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LO QUE **NO** HACE
 *
 * No inventa colores por su cuenta si no hay gramática, y no "aproxima" con la
 * gramática de otro lenguaje: si no hay `.tmLanguage` usable devuelve `null` y
 * el archivo queda con el color del motor (o sin color). Un lenguaje pintado
 * con las reglas de otro se ve bien y miente.
 */

import {
  LanguageRegistry,
  type RegisteredLanguage
} from '@services/extensions/types/languages/logic'
import { resolvePackagePath } from '@services/extensions/extensionDirs'
import { resolveSlotForScopes, type HostToken, type ScopeRule } from '@shared/syntax'
import type { TokenizeGrammarRef } from '@shared/extensions'

/** Gramática TextMate ya resuelta a una ruta absoluta del paquete. */
interface ResolvedTextMateGrammar {
  scopeName: string
  absolutePath: string
  embeddedLanguages?: Record<string, string>
  injectTo?: string[]
}

/**
 * Gramáticas TextMate usables de un lenguaje.
 *
 * "Usable" = tiene `scopeName`, tiene `path` y su paquete instalado está
 * registrado (o sea: se puede armar la ruta absoluta). Un lenguaje builtin no
 * tiene paquete en disco, así que no aporta gramáticas — no es un error: su
 * gramática, si la tiene, está compilada dentro del motor.
 */
function textMateGrammarsOf(language: RegisteredLanguage | null): ResolvedTextMateGrammar[] {
  if (!language) return []
  const out: ResolvedTextMateGrammar[] = []
  for (const grammar of language.grammars) {
    if (grammar.kind !== 'textMate') continue
    const absolutePath = resolvePackagePath(language.extensionId, grammar.path)
    if (!absolutePath) continue
    out.push({
      scopeName: grammar.scopeName,
      absolutePath,
      embeddedLanguages: grammar.embeddedLanguages,
      injectTo: grammar.injectTo
    })
  }
  return out
}

/**
 * Candidatas que se le pasan al main: la gramática del lenguaje, las de los
 * lenguajes que declara como EMBEBIDOS y las que se inyectan dentro de la
 * nuestra.
 *
 * El main necesita las tres para hacer las dos pasadas del resaltado real
 * (inyecciones + re-tokenizado del tramo). Mandarle sólo la raíz haría que un
 * bloque de Gleam en markdown quedara con los colores de markdown.
 */
function collectGrammarRefs(language: RegisteredLanguage | null): {
  refs: TokenizeGrammarRef[]
  root: ResolvedTextMateGrammar | null
} {
  const direct = textMateGrammarsOf(language)
  const root = direct[0] ?? null
  /** Convierte una gramática resuelta en la referencia que viaja al main. */
  const toRef = (grammar: ResolvedTextMateGrammar, owner: string): TokenizeGrammarRef => ({
    scopeName: grammar.scopeName,
    path: grammar.absolutePath,
    language: owner,
    embeddedLanguages: grammar.embeddedLanguages,
    injectTo: grammar.injectTo
  })
  const refs: TokenizeGrammarRef[] = direct.map((grammar) =>
    toRef(grammar, language?.id ?? '')
  )

  // Candidatas que se necesitan para poder resolver los tramos EMBEBIDOS:
  // la gramática del lenguaje que declara `embeddedLanguages` (Gleam dentro de
  // markdown) y la de los lenguajes que se inyectan en algún scope de esta.
  const needed = new Set<string>()
  for (const grammar of direct) {
    for (const languageId of Object.values(grammar.embeddedLanguages ?? {})) needed.add(languageId)
  }
  for (const languageId of needed) {
    if (languageId === language?.id) continue
    for (const grammar of textMateGrammarsOf(LanguageRegistry.get(languageId))) {
      if (refs.some((ref) => ref.scopeName === grammar.scopeName)) continue
      refs.push(toRef(grammar, languageId))
    }
  }

  // Y las gramáticas de OTROS lenguajes que se inyectan DENTRO de la nuestra:
  // sin esto el bloque embebido nunca queda marcado con su scope propio y no
  // hay nada que re-tokenizar (el error clásico de hacer sólo la mitad).
  const rootScopes = new Set(direct.map((grammar) => grammar.scopeName))
  for (const other of LanguageRegistry.getAll()) {
    if (other.id === language?.id) continue
    for (const grammar of textMateGrammarsOf(other)) {
      if (!grammar.injectTo?.some((scope) => rootScopes.has(scope))) continue
      if (refs.some((ref) => ref.scopeName === grammar.scopeName)) continue
      refs.push(toRef(grammar, other.id))
    }
  }

  return { refs, root }
}

export interface LanguageHighlightOptions {
  /** Ruta del archivo (se usa para resolver el lenguaje si no hay `languageId`). */
  path: string
  text: string
  /** Fuerza el lenguaje (p. ej. el que el editor ya tiene activo). */
  languageId?: string
  /** Reglas del tema activo: pisan la tabla por defecto a igual especificidad. */
  rules?: ScopeRule<number>[]
}

/** Lo que devuelve un resaltado con gramática de extensión. */
export interface LanguageHighlight {
  /** Lenguaje resuelto (`zig`, `gleam`…): el editor lo usa para el motor. */
  languageId: string
  /** Scope raíz de la gramática aplicada. */
  scopeName: string
  /** Extensión/pack dueño de la gramática (para la UI de inspección). */
  extensionId: string
  tokens: HostToken[]
  /**
   * Stacks de scopes usados por los tokens.
   *
   * Viaja aparte (y ya viene INTERNEADO del main: ~40 stacks para un archivo
   * grande) porque el token del motor sólo lleva el slot. Sin esto no hay forma
   * de responder "¿por qué este `+` es naranja?": el panel de inspección necesita
   * el scope, y reconstruir el tokenizado para averiguarlo sería tokenizar dos
   * veces.
   */
  scopeSets: string[][]
  /** Índice en `scopeSets` de cada token (paralelo a `tokens`). */
  scopeIndex: number[]
}

/**
 * Resaltado con la gramática de una extensión, ya resuelto a slots.
 *
 * `null` = no hay gramática de extensión para este archivo (el motor se
 * encarga, o el archivo queda sin colores). Nunca devuelve una lista vacía
 * "con éxito": esa diferencia importa para que el puente no borre los tokens
 * de otra fuente ni cambie el lenguaje que el motor ya tenía.
 */
export async function tokenizeWithLanguageGrammar(
  options: LanguageHighlightOptions
): Promise<LanguageHighlight | null> {
  const api = window.api?.extensions
  if (!api?.tokenize) return null

  const language = options.languageId
    ? LanguageRegistry.get(options.languageId)
    : LanguageRegistry.forPath(options.path)
  if (!language) return null

  const { refs, root } = collectGrammarRefs(language)
  if (!root) return null

  const result = await api.tokenize({
    scopeName: root.scopeName,
    grammars: refs,
    text: options.text
  })
  if (!result.ok) {
    console.warn(`[languages] tokenizado falló (${root.scopeName}): ${result.error ?? 'sin detalle'}`)
    return null
  }

  return {
    languageId: language.id,
    scopeName: root.scopeName,
    extensionId: language.extensionId,
    tokens: tokensFromScopes(result.scopeSets, result.tokens, options.rules ?? []),
    scopeSets: result.scopeSets,
    scopeIndex: result.tokens.map((token) => token.scopes)
  }
}

/**
 * Scopes internea-dos → tokens con slot.
 *
 * El memo por índice es lo que hace que esto sea barato: un archivo grande
 * tiene decenas de miles de tokens pero del orden de decenas de stacks de
 * scopes distintos, así que se resuelve cada stack UNA vez.
 */
export function tokensFromScopes(
  scopeSets: string[][],
  tokens: Array<{ line: number; start: number; end: number; scopes: number }>,
  rules: ScopeRule<number>[] = []
): HostToken[] {
  const slotByScopeIndex = new Map<number, number>()

  const slotOf = (scopeIndex: number): number => {
    const cached = slotByScopeIndex.get(scopeIndex)
    if (cached !== undefined) return cached
    const scopes = scopeSets[scopeIndex] ?? []
    const slot = resolveSlotForScopes(scopes, rules)
    slotByScopeIndex.set(scopeIndex, slot)
    return slot
  }

  return tokens.map((token) => ({
    line: token.line,
    startChar: token.start,
    length: token.end - token.start,
    slot: slotOf(token.scopes)
  }))
}
