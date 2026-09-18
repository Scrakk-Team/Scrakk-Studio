/**
 * Qué motor pinta la capa de GRAMÁTICA de un lenguaje: la ÚNICA decisión.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ES UN MÓDULO Y NO UN `if` EN CADA PUENTE
 *
 * Hay dos puentes que quieren pintar el mismo archivo:
 *
 *   `languageHighlightBridge`   → gramática TextMate del paquete (VS Code)
 *   `treeSitterHighlightBridge` → parser tree-sitter del paquete (dinámico)
 *
 * Antes cada uno decidía por su cuenta con una regla escondida ("si hay
 * TextMate, el árbol no corre"). Eso hacía imposible que el usuario eligiera, y
 * dejaba dos lugares donde la regla podía divergir. Ahora los dos preguntan
 * acá: `selectGrammarEngine()` devuelve QUIÉN gana, y el que no gana no publica
 * nada (publicar los dos sería pintar dos veces el mismo rango sin desempate).
 *
 * La preferencia (`auto` / `treeSitter` / `textMate`) es del usuario y vive en
 * el storage system; el default `auto` reproduce el comportamiento histórico.
 */

import { LanguageRegistry, type RegisteredLanguage } from '@services/extensions/types/languages/logic'
import { getPersistedGrammarEngine } from '@services/storage'

/** Gramática tree-sitter usable (parser `.wasm` del paquete). */
export interface DynamicGrammarRef {
  parser: string
  sha256?: string
  abi?: string
}

/**
 * La gramática tree-sitter del paquete, si hay una USABLE.
 *
 * Un parser nativo (`.so`/`.dll`) no cuenta: esta capa sólo ejecuta `.wasm` en
 * un proceso aparte (el worker rechaza lo demás con su motivo).
 */
export function dynamicGrammarOf(language: RegisteredLanguage | null): DynamicGrammarRef | null {
  if (!language) return null
  for (const grammar of language.grammars) {
    if (grammar.kind !== 'treeSitter') continue
    if (grammar.native) continue
    if (!grammar.parser.endsWith('.wasm')) continue
    return { parser: grammar.parser, sha256: grammar.sha256, abi: grammar.abi }
  }
  return null
}

/** ¿El lenguaje tiene gramática TextMate del paquete? */
export function hasTextMateGrammar(language: RegisteredLanguage | null): boolean {
  return Boolean(language?.grammars.some((grammar) => grammar.kind === 'textMate'))
}

/** Quién pinta la gramática de este lenguaje (o nadie). */
export type GrammarEngineChoice = 'textMate' | 'treeSitter' | null

/**
 * Resuelve el motor que gana, según lo que el lenguaje ofrece y lo que el
 * usuario pidió.
 *
 *  - Sin ninguna de las dos gramáticas → `null` (pinta el motor embebido).
 *  - `auto` (default): TextMate si existe (es el camino de las extensiones de
 *    VS Code), si no el árbol.
 *  - `treeSitter`: el árbol si hay uno usable — incluso si además hay TextMate.
 *    Si no hay `.wasm`, cae a TextMate para no dejar el archivo sin color.
 *  - `textMate`: sólo TextMate; el proceso del parser ni se levanta.
 */
export function selectGrammarEngine(language: RegisteredLanguage | null): GrammarEngineChoice {
  if (!language) return null
  const treeSitter = dynamicGrammarOf(language) !== null
  const textMate = hasTextMateGrammar(language)
  const preference = getPersistedGrammarEngine()

  if (preference === 'textMate') return textMate ? 'textMate' : null
  if (preference === 'treeSitter') {
    if (treeSitter) return 'treeSitter'
    return textMate ? 'textMate' : null
  }
  if (textMate) return 'textMate'
  return treeSitter ? 'treeSitter' : null
}

/**
 * La preferencia cruda del usuario (`auto` | `treeSitter` | `textMate`).
 *
 * La usan los mensajes de diagnóstico: cuando el usuario eligió un motor y el
 * lenguaje no lo tiene, el motivo tiene que decir ESO ("elegiste TextMate y este
 * lenguaje no trae .tmLanguage") en vez de un genérico "sin gramática usable",
 * que manda a buscar el problema donde no está.
 */
export function grammarEnginePreference(): 'auto' | 'treeSitter' | 'textMate' {
  return getPersistedGrammarEngine()
}

/** El lenguaje del archivo según lo que registró el usuario (o `null`). */
export function resolveLanguage(path: string, languageId?: string): RegisteredLanguage | null {
  return languageId ? LanguageRegistry.get(languageId) : LanguageRegistry.forPath(path)
}

/** Evento que dispara el ajuste cuando el usuario cambia de motor. */
export const GRAMMAR_ENGINE_EVENT = 'highlight-engine-changed'
