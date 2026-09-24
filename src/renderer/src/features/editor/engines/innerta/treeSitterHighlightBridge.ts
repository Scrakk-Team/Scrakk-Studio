// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Puente del árbol de sintaxis DINÁMICO (parser del paquete) — UN pedido, todo
 * lo que el árbol sabe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ AGREGA SOBRE LA GRAMÁTICA TEXTMATE
 *
 * Un paquete SEF puede traer su propio parser tree-sitter (`grammars/x.wasm`) y
 * sus queries (`.scm`). Eso es MÁS preciso que un `.tmLanguage`: el árbol de
 * sintaxis sabe que ese `*` es multiplicación y no un puntero, cosa que una
 * gramática de expresiones regulares no puede saber. El precio es un proceso
 * aparte por lenguaje y un `.wasm` que ejecutar — ver `treeSitter/manager.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO ES SÓLO COLOR
 *
 * El pedido viaja con TODAS las categorías de query y la respuesta trae:
 *
 *   highlights   → los tokens (lo que publica `hostTokens`)
 *   tags         → símbolos → panel Outline (sin LSP)
 *   folds        → rangos plegables → motor (plegado por ÁRBOL, no por sangría)
 *   injections   → tramos de otro lenguaje (el main los re-tokeniza)
 *   locals       → definiciones y referencias → Ir a la definición sin LSP
 *   textobjects  → rangos seleccionables → Expandir selección
 *
 * El parser ya está cargado y el árbol construido: correr las otras categorías
 * cuesta un `matches()` por query, no otro proceso.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REGLAS DE CONVIVENCIA
 *
 * 1. **Quién gana lo decide `selectGrammarEngine()`** (la preferencia del
 *    usuario: `auto` / `treeSitter` / `textMate`). Aquí sólo se respeta: si el
 *    elegido es TextMate, este puente no publica ni levanta el proceso.
 * 2. **Sin `.wasm` no hay nada que hacer.** Un parser nativo (`.so`/`.dll`) NO
 *    se carga: requiere permiso explícito y el worker lo rechaza con ese motivo.
 */

import type { InnertaModule } from './InnertaEngine'
import { applyLanguage } from './languageHighlightBridge'
import { setSourceTokens } from './hostTokens'
import { clearHighlightSnapshot, recordHighlightSnapshot } from './highlightSnapshot'
import { currentThemeTokenRules } from './themeTokenRules'
import { applyInnertaFolds, innertaFoldsState } from './hostBridge'
import {
  dynamicGrammarOf,
  grammarEnginePreference,
  hasTextMateGrammar,
  resolveLanguage,
  selectGrammarEngine,
  GRAMMAR_ENGINE_EVENT
} from './grammarSelection'
import {
  LanguageRegistry,
  type RegisteredLanguage
} from '@services/extensions/types/languages/logic'
import { resolvePackagePath } from '@services/extensions/extensionDirs'
import { tokensFromScopes } from '@services/extensions/types/languages/highlight'
import {
  clearDynamicSyntax,
  publishDynamicSyntax,
  toDocumentSymbols
} from '@services/extensions/dynamicSyntax'
import type {
  DynamicEmbeddedParserRef,
  DynamicQueryRef,
  DynamicTokenizeRequest
} from '@shared/extensions'

const DEBOUNCE_MS = 250

/** Timers y corridas por módulo (igual patrón que el puente TextMate). */
const timers = new WeakMap<InnertaModule, ReturnType<typeof setTimeout>>()
const currentRun = new WeakMap<InnertaModule, number>()
let runSeq = 0

/** ¿Este módulo tiene algo publicado por nosotros? (para limpiar una sola vez) */
const published = new WeakMap<InnertaModule, boolean>()

/**
 * KIND de plegado → número que entiende el motor.
 *
 * El motor sólo necesita distinguir el tipo para dibujar el hint del bloque
 * plegado (`{…}` de una región, `// …` de un comentario), igual que VS Code.
 */
const FOLD_KIND = { region: 0, comment: 1, imports: 2 } as const

function foldKindCode(kind: string): number {
  const normalized = kind.toLowerCase()
  if (normalized.includes('comment')) return FOLD_KIND.comment
  if (normalized.includes('import')) return FOLD_KIND.imports
  return FOLD_KIND.region
}

/** Rangos plegables → tripletes `(start, end, kind)` para el motor. */
export function foldPayload(
  folds: Array<{ startLine: number; endLine: number; kind: string }>
): number[] {
  const out: number[] = []
  for (const fold of folds) {
    if (fold.endLine <= fold.startLine) continue
    out.push(fold.startLine, fold.endLine, foldKindCode(fold.kind))
  }
  return out
}

/** Rutas absolutas de TODAS las queries usables del lenguaje. */
function collectQueryRefs(language: RegisteredLanguage): DynamicQueryRef[] {
  const queries: DynamicQueryRef[] = []
  for (const query of language.queries) {
    const file = resolvePackagePath(language.extensionId, query.file)
    if (!file) continue
    queries.push({ file, category: query.category })
  }
  return queries
}

/**
 * Parsers de los lenguajes que las `injections.scm` declaran.
 *
 * Los nombres de lenguaje están en el ÍNDICE de la query (se leen al registrar
 * el lenguaje, sin ejecutar nada). De ahí sale el parser `.wasm` del lenguaje
 * inyectado, que el main necesita para re-tokenizar el tramo. Si el lenguaje
 * inyectado no está instalado o no tiene parser, simplemente no se manda: el
 * tramo queda con el color del padre en vez de romper el tokenizado entero.
 */
function collectEmbeddedRefs(language: RegisteredLanguage): DynamicEmbeddedParserRef[] {
  const declared = new Set<string>()
  for (const query of language.queries) {
    if (query.category !== 'injections') continue
    for (const name of query.injectionLanguages) declared.add(name.toLowerCase())
  }
  if (declared.size === 0) return []

  const out: DynamicEmbeddedParserRef[] = []
  for (const candidate of LanguageRegistry.getAll()) {
    if (candidate.id === language.id) continue
    if (!declared.has(candidate.id.toLowerCase())) continue
    // El nombre declarado también puede ser un ALIAS (`js` → `javascript`).
    const grammar = dynamicGrammarOf(candidate)
    if (!grammar) continue
    const parserPath = resolvePackagePath(candidate.extensionId, grammar.parser)
    if (!parserPath) continue
    const queries: DynamicQueryRef[] = []
    for (const query of candidate.queries) {
      if (query.category !== 'highlights') continue
      const file = resolvePackagePath(candidate.extensionId, query.file)
      if (file) queries.push({ file, category: query.category })
    }
    if (queries.length === 0) continue
    out.push({
      languageId: candidate.id,
      parserPath,
      sha256: grammar.sha256,
      abi: grammar.abi,
      queries
    })
    // El alias declarado apunta al mismo parser: se registra también para que
    // el worker lo encuentre por el nombre que usó la query.
    for (const name of declared) {
      if (!candidate.aliases.includes(name) && name !== candidate.id.toLowerCase()) continue
      if (out.some((ref) => ref.languageId === name)) continue
      out.push({ ...out[out.length - 1], languageId: name })
    }
  }
  return out
}

/** Arma el pedido con rutas ABSOLUTAS (el main verifica que estén en el paquete). */
function buildRequest(
  language: RegisteredLanguage,
  grammar: { parser: string; sha256?: string; abi?: string },
  text: string
): DynamicTokenizeRequest | null {
  const parserPath = resolvePackagePath(language.extensionId, grammar.parser)
  if (!parserPath) return null
  const queries = collectQueryRefs(language)
  if (queries.length === 0) return null

  return {
    languageId: language.id,
    parserPath,
    sha256: grammar.sha256,
    abi: grammar.abi,
    queries,
    embedded: collectEmbeddedRefs(language),
    text
  }
}

/**
 * Recalcula todo lo que el árbol sabe del archivo (debounced).
 *
 * `immediate` lo usa la apertura: el usuario está mirando el archivo y esperar
 * se ve como parpadeo.
 */
export function refreshDynamicHighlight(
  mod: InnertaModule,
  path: string,
  text: string,
  options: { immediate?: boolean; languageId?: string } = {}
): void {
  const existing = timers.get(mod)
  if (existing) clearTimeout(existing)

  /**
   * Explica por qué NO se tokenizó. Sólo al abrir el archivo (no en cada
   * tecla): sin esto, "el archivo no tiene color" no se puede diagnosticar — el
   * camino dinámico es silencioso por diseño (no hay gramática ≠ hay error).
   */
  const explain = (reason: string): void => {
    if (!options.immediate) return
    console.debug(`[languages] sin tree-sitter dinámico (${reason}): ${path}`)
  }

  const run = (): void => {
    const api = window.api?.extensions
    if (!api?.tokenizeDynamic) {
      explain('el puente nativo no expone tokenizeDynamic')
      return
    }

    const language = resolveLanguage(path, options.languageId)
    if (!language) {
      explain('ninguna extensión registró este lenguaje')
      return
    }
    // La preferencia del usuario manda: si eligió TextMate (o `auto` con
    // gramática TextMate disponible), este puente no corre — publicar los dos
    // sería pintar el mismo rango dos veces.
    const choice = selectGrammarEngine(language)
    if (choice !== 'treeSitter') {
      // Si veníamos publicando (el usuario cambió de motor), se limpia: los
      // folds del árbol no pueden quedar en un archivo que ahora pinta TextMate.
      if (published.get(mod)) clearDynamicHighlight(mod, path)
      // El motivo distingue las TRES situaciones, porque cada una se arregla
      // distinto: el usuario eligió otro motor, eligió TextMate y el lenguaje no
      // lo trae, o el paquete no declara ninguna gramática.
      const reason =
        choice === 'textMate'
          ? 'el motor elegido es TextMate'
          : grammarEnginePreference() === 'textMate'
            ? 'el motor elegido es TextMate y este lenguaje no trae .tmLanguage'
            : hasTextMateGrammar(language)
              ? 'el lenguaje tiene gramática TextMate'
              : 'sin gramática usable'
      explain(reason)
      return
    }
    const grammar = dynamicGrammarOf(language)
    if (!grammar) {
      explain(`el lenguaje ${language.id} no declara un parser tree-sitter .wasm`)
      return
    }
    const request = buildRequest(language, grammar, text)
    if (!request) {
      explain(`el paquete ${language.extensionId} no tiene parser o queries usables`)
      return
    }

    // El motor tiene que saber de qué lenguaje es el buffer ANTES de que
    // lleguen los tokens: con un id que no tiene compilado cae a `plaintext`,
    // que es el modo donde los tokens del host se pintan sin competir con una
    // gramática embebida. Sin esto, el archivo se quedaba con el lenguaje
    // anterior (o con `text`) y el editor no volvía a pintar.
    applyLanguage(mod, language.id)

    const seq = ++runSeq
    currentRun.set(mod, seq)
    // Las reglas del tema entran al resolutor: las capturas de tree-sitter son
    // SCOPES como los de TextMate, así que el tema decide el color igual.
    const rules = currentThemeTokenRules()

    void api
      .tokenizeDynamic(request)
      .then((result) => {
        // Respuesta vieja: el archivo cambió mientras el worker tokenizaba.
        if (currentRun.get(mod) !== seq) return
        if (!result.ok) {
          // Un fallo del parser NO borra lo que ya estaba pintado por otra
          // fuente: se reporta y el editor queda como estaba.
          console.warn(
            `[languages] tree-sitter dinámico falló (${language.id}): ${result.error ?? 'sin detalle'}`
          )
          setSourceTokens(mod, path, 'treeSitterDynamic', null)
          clearHighlightSnapshot(path, 'treeSitterDynamic')
          clearDynamicSyntax(path)
          return
        }
        for (const failure of result.failed) {
          console.warn(
            `[languages] query no compilada (${language.id}): ${failure.file} — ${failure.error}`
          )
        }

        const tokens = tokensFromScopes(result.scopeSets, result.tokens, rules)
        setSourceTokens(mod, path, 'treeSitterDynamic', tokens.length > 0 ? tokens : null)
        if (tokens.length > 0) {
          recordHighlightSnapshot({
            path,
            source: 'treeSitterDynamic',
            languageId: language.id,
            scopeName: language.id,
            extensionId: language.extensionId,
            tokens: tokens.map((token, index) => ({
              line: token.line,
              startChar: token.startChar,
              length: token.length,
              slot: token.slot,
              detail: result.scopeSets[result.tokens[index]?.scopes ?? -1] ?? []
            })),
            at: Date.now()
          })
        } else {
          clearHighlightSnapshot(path, 'treeSitterDynamic')
        }

        published.set(mod, true)

        const data = result.data
        if (!data) return

        // ── Plegado: al motor, que es quien dibuja los chevrons del gutter ──
        // Se manda lo que el motor puede usar (`foldPayload` descarta rangos
        // vacíos) y se pregunta por el estado REAL: el conteo del motor es el
        // único dato que distingue "llegaron" de "se mandaron".
        const foldRanges = foldPayload(data.folds)
        const foldsApplied = applyInnertaFolds(path, foldRanges)
        const foldsState = innertaFoldsState(path)
        const foldsDetail = foldsState
          ? `${foldRanges.length / 3} en el motor${
              foldsState.fromEngine
                ? ', del árbol embebido'
                : foldsState.fromHost
                  ? ', del host'
                  : ', por indentación'
            }`
          : 'motor sin getter de plegado'

        // ── Indentación: niveles de `indents.scm` → motor (tecla Enter) ─────
        // El motor NO adivina: si no llegan niveles, conserva la sangría.
        if (data.indentLevels && data.indentLevels.length > 0) {
          mod.setIndentLevels?.(data.indentLevels)
        }

        // Una línea por pasada, en `debug`: es la ÚNICA forma de saber qué hizo
        // el árbol con un archivo (cuántos símbolos, si el motor aceptó los
        // folds). Sin esto, un lenguaje sin queries se ve igual que uno con
        // queries rotas: "no hay color" y a adivinar. Los probes de la app
        // compilada leen exactamente esta línea.
        console.debug(
          `[languages] ${language.id}: ${tokens.length} tokens · ` +
            `${data.symbols.length} símbolos · folds: ${foldsDetail} ${foldsApplied ? '(aplicados)' : '(NO aplicados)'} · ` +
            `${data.locals.length} locales · ${data.textObjects.length} textobjects · ` +
            `${data.injections.length} inyecciones · categorías: ${data.appliedCategories.join(',') || 'ninguna'}`
        )

        // ── El resto del árbol: al store, para sus consumidores ────────────
        publishDynamicSyntax(path, {
          languageId: language.id,
          extensionId: language.extensionId,
          symbols: toDocumentSymbols(data.symbols),
          folds: data.folds,
          locals: data.locals,
          textObjects: data.textObjects,
          appliedCategories: data.appliedCategories,
          at: Date.now()
        })
      })
      .catch((error: unknown) => {
        console.warn('[languages] tree-sitter dinámico lanzó:', error)
        setSourceTokens(mod, path, 'treeSitterDynamic', null)
        clearHighlightSnapshot(path, 'treeSitterDynamic')
        clearDynamicSyntax(path)
      })
  }

  if (options.immediate) {
    run()
    return
  }
  timers.set(mod, setTimeout(run, DEBOUNCE_MS))
}

/** El archivo se cerró: se saca lo de esta fuente (color, datos y plegado). */
export function clearDynamicHighlight(mod: InnertaModule, path: string): void {
  const existing = timers.get(mod)
  if (existing) {
    clearTimeout(existing)
    timers.delete(mod)
  }
  runSeq++
  currentRun.delete(mod)
  published.delete(mod)
  setSourceTokens(mod, path, 'treeSitterDynamic', null)
  clearHighlightSnapshot(path, 'treeSitterDynamic')
  clearDynamicSyntax(path)
  // El motor no puede quedarse con los folds del archivo anterior: sin rangos
  // vuelve a plegar por indentación.
  applyInnertaFolds(path, [])
}

/** Re-export para los llamadores que ya importaban el nombre viejo. */
export { GRAMMAR_ENGINE_EVENT }
