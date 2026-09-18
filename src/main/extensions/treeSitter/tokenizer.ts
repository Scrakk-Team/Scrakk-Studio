/**
 * Núcleo del tokenizador tree-sitter dinámico (sin transporte).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTÁ SEPARADO DEL PROCESO
 *
 * El proceso (`entry.ts`) es sólo transporte: recibe un mensaje, llama acá y
 * contesta. Toda la lógica que se puede probar sin levantar un proceso vive en
 * este archivo: carga del `.wasm`, caché de parser y queries, el armado de
 * tokens y los DATOS del árbol (símbolos, plegado, inyecciones, alcances).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DE COLOR A "LO QUE EL ÁRBOL SABE"
 *
 * Un pedido devuelve, de una sola pasada:
 *
 *   highlights   → tokens (el color, que es lo que ya había)
 *   tags         → símbolos anidados (el outline, sin LSP)
 *   folds        → rangos plegables
 *   injections   → tramos que son OTRO lenguaje, y su color re-tokenizado
 *   locals       → definiciones y referencias (ir a la definición sin LSP)
 *   textobjects  → rangos seleccionables
 *
 * El parser ya está cargado y el árbol ya está construido: correr las otras
 * categorías cuesta un `matches()` por query, no otro proceso. Devolver sólo
 * color era tirar el resto del árbol a la basura.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CACHÉ Y FIRMAS
 *
 * Un `.wasm` y sus queries se cargan UNA vez por proceso. La firma usa el
 * `mtime` de los archivos: si el paquete se reinstala o se edita, se recarga en
 * el próximo tokenizado en vez de servir el parser viejo hasta reiniciar.
 */

import * as fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import { Language, Parser, Query, type Node as TsNode } from 'web-tree-sitter'
import { categorizeQueryFile, type QueryCategory } from '@shared/syntax/queries'
import type {
  DynamicEmbeddedParserRef,
  DynamicQueryRef,
  DynamicSyntaxData,
  DynamicTokenizeRequest,
  DynamicTokenizeResult
} from '@shared/extensions'
import { classifyParserAbi } from './abi'
import {
  buildScopeTokens,
  lineStarts,
  type RawCapture,
  type ScopeTokenResult
} from './scopes'
import {
  buildFoldRanges,
  buildInjectionRanges,
  buildLocalEntries,
  buildSymbols,
  buildTextObjects,
  type RawMatch
} from './queryData'

/** Runtime de tree-sitter (wasm del binding), cargado una vez por proceso. */
let runtimeReady: Promise<void> | null = null

/**
 * Cuántos tramos embebidos se tokenizan como máximo por pedido.
 *
 * Un archivo con cientos de bloques (un log con miles de heredocs) levantaría
 * tantos parseos como bloques: se recorta y el resto queda con el color del
 * lenguaje raíz. El límite se reporta para que no sea un misterio.
 */
export const MAX_EMBEDDED_RANGES = 32

/** Categorías cuyo dato SÍ se consume hoy (se reporta en cada resultado). */
const APPLIED_CATEGORIES: QueryCategory[] = [
  'highlights',
  'tags',
  'folds',
  'injections',
  'locals',
  'textobjects'
]

function defaultResolve(id: string): string {
  if (typeof require === 'function' && typeof require.resolve === 'function') {
    return require.resolve(id)
  }
  // Bundle ESM (o tests): el resolver se ancla al PROPIO archivo. Anclado al
  // cwd funcionaba sólo si la app se abría desde la raíz del proyecto — o sea en
  // dev — y fallaba al abrirla desde el menú (cwd = $HOME), donde
  // `web-tree-sitter` no está: el worker moría sin cargar un solo `.scm`.
  const anchor =
    typeof __filename === 'string' ? __filename : path.join(process.cwd(), 'index.js')
  return createRequire(anchor).resolve(id)
}

/**
 * Inicializa el runtime wasm.
 *
 * `locateFile` se resuelve por `require.resolve` y no con una ruta relativa al
 * bundle: en producción el paquete vive dentro del asar y una ruta relativa al
 * `.js` compilado apuntaría a un archivo que no existe (el clásico
 * "abort() en tree-sitter.wasm" que sólo aparece en el build empaquetado).
 */
function ensureRuntime(resolveFile: (id: string) => string): Promise<void> {
  if (!runtimeReady) {
    runtimeReady = Parser.init({
      locateFile: () => resolveFile('web-tree-sitter/web-tree-sitter.wasm')
    })
    // Si falla, que se pueda reintentar en la próxima llamada en vez de quedar
    // atado a una promesa rechazada para siempre.
    runtimeReady.catch(() => {
      runtimeReady = null
    })
  }
  return runtimeReady
}

/** Parser + queries compiladas de un lenguaje (por ruta de parser). */
interface LoadedGrammar {
  parser: Parser
  /** Query compiladas por ruta de `.scm`. */
  queries: Map<string, Query>
  /** Queries que no compilaron: se reportan en cada resultado. */
  failed: Array<{ file: string; error: string }>
  /** Firma de la carga: si cambió algo en disco, se recarga. */
  signature: string
}

/** Lo mínimo para cargar un lenguaje (la raíz y cada embebido lo cumplen). */
interface GrammarSpec {
  parserPath: string
  abi?: string
  queries: DynamicQueryRef[]
}

export interface TreeSitterTokenizerOptions {
  /** Resolver de assets del binding (inyectable en tests). */
  resolveFile?: (id: string) => string
}

export interface TreeSitterTokenizer {
  tokenize(request: DynamicTokenizeRequest): Promise<DynamicTokenizeResult>
  /** Suelta el parser cacheado de un lenguaje (cambio de paquete, tests). */
  forget(parserPath?: string): void
}

async function fileSignature(file: string): Promise<string> {
  try {
    const stat = await fs.stat(file)
    return `${file}:${stat.mtimeMs}`
  } catch {
    return `${file}:missing`
  }
}

export function createTreeSitterTokenizer(
  options: TreeSitterTokenizerOptions = {}
): TreeSitterTokenizer {
  const resolveFile = options.resolveFile ?? defaultResolve
  const grammars = new Map<string, LoadedGrammar>()

  const empty = (error: string): DynamicTokenizeResult => ({
    ok: false,
    error,
    scopeSets: [],
    tokens: [],
    applied: [],
    failed: []
  })

  async function signatureOf(spec: GrammarSpec): Promise<string> {
    const files = [spec.parserPath, ...spec.queries.map((query) => query.file)]
    const signatures = await Promise.all(files.map((file) => fileSignature(file)))
    return signatures.join('|')
  }

  async function loadGrammar(spec: GrammarSpec): Promise<LoadedGrammar> {
    await ensureRuntime(resolveFile)

    const signature = await signatureOf(spec)
    const cached = grammars.get(spec.parserPath)
    if (cached && cached.signature === signature) return cached

    if (spec.parserPath.endsWith('.so') || spec.parserPath.endsWith('.dll')) {
      throw new Error(
        'parser nativo (no wasm): esta capa sólo carga `.wasm`; el camino nativo requiere permiso explícito'
      )
    }

    const bytes = await fs.readFile(spec.parserPath)
    const language = await Language.load(new Uint8Array(bytes))

    const abi = classifyParserAbi(language, spec.abi)
    if (abi.warning) console.warn(`[tree-sitter] ${spec.parserPath}: ${abi.warning}`)

    // El parser se recicla entre corridas: crear uno por tokenizado era el
    // costo más caro de abrir un archivo de un lenguaje dinámico.
    const parser = new Parser()
    parser.setLanguage(language)

    const queries = new Map<string, Query>()
    const failed: Array<{ file: string; error: string }> = []
    for (const ref of spec.queries) {
      try {
        const source = await fs.readFile(ref.file, 'utf-8')
        queries.set(ref.file, new Query(language, source))
      } catch (error) {
        // Una query rota NO invalida el lenguaje: se pierde esa capa (p. ej. un
        // `highlights.scm` de otra versión del parser) y el resto sigue. Si
        // fuera fatal, un `.scm` viejo dejaría el archivo sin ningún color.
        failed.push({
          file: ref.file,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const loaded: LoadedGrammar = { parser, queries, failed, signature }
    grammars.set(spec.parserPath, loaded)
    return loaded
  }

  /**
   * Corre las queries y devuelve los matches por categoría.
   *
   * Se corren TODAS las categorías que el renderer mandó: la categoría decide
   * dónde va el dato, no si se ejecuta. Una query que falla se reporta y las
   * demás siguen.
   */
  function collectMatches(
    grammar: LoadedGrammar,
    refs: DynamicQueryRef[],
    root: TsNode
  ): {
    capturesByCategory: Map<QueryCategory, RawCapture[]>
    matchesByCategory: Map<QueryCategory, RawMatch[]>
    applied: string[]
    failed: Array<{ file: string; error: string }>
  } {
    const capturesByCategory = new Map<QueryCategory, RawCapture[]>()
    const matchesByCategory = new Map<QueryCategory, RawMatch[]>()
    const applied: string[] = []
    const failed = [...grammar.failed]

    for (const ref of refs) {
      const query = grammar.queries.get(ref.file)
      if (!query) continue
      const category = ref.category ?? categorizeQueryFile(ref.file)
      try {
        const categoryMatches = matchesByCategory.get(category) ?? []
        const categoryCaptures = capturesByCategory.get(category) ?? []
        for (const match of query.matches(root)) {
          const captures: RawCapture[] = []
          for (const capture of match.captures) {
            if (capture.node.startIndex >= capture.node.endIndex) continue
            const raw: RawCapture = {
              start: capture.node.startIndex,
              end: capture.node.endIndex,
              name: capture.name,
              properties: capture.setProperties ?? undefined
            }
            captures.push(raw)
            categoryCaptures.push(raw)
          }
          categoryMatches.push({
            captures,
            properties: match.setProperties ?? {}
          })
        }
        matchesByCategory.set(category, categoryMatches)
        capturesByCategory.set(category, categoryCaptures)
        applied.push(ref.file)
      } catch (error) {
        failed.push({
          file: ref.file,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return { capturesByCategory, matchesByCategory, applied, failed }
  }

  /**
   * Texto de un tramo a partir de sus coordenadas (líneas/columnas del motor).
   *
   * Se recorta al texto real: un parser puede devolver un rango que termina
   * justo en el salto de línea y no hay que desbordar la línea.
   */
  function sliceRange(
    text: string,
    starts: number[],
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  ): { text: string; startIndex: number } | null {
    const startLine = starts[range.startLine]
    const endLineStart = starts[range.endLine]
    if (startLine === undefined || endLineStart === undefined) return null
    const startIndex = Math.min(text.length, startLine + range.startColumn)
    const endIndex = Math.min(text.length, endLineStart + range.endColumn)
    if (endIndex <= startIndex) return null
    return { text: text.slice(startIndex, endIndex), startIndex }
  }

  /**
   * Re-tokeniza cada tramo inyectado con el parser de SU lenguaje.
   *
   * Es el equivalente dinámico de `embeddedLanguages` de VS Code: sin esto, un
   * bloque de JavaScript dentro de un markdown queda con los scopes del padre
   * (se ve como texto, no como código). Los tokens embebidos se desplazan a la
   * posición real del tramo y REEMPLAZAN a los de la raíz que cayeran encima:
   * el lenguaje inyectado es más específico por definición.
   */
  async function tokenizeEmbedded(
    request: DynamicTokenizeRequest,
    injections: Array<{
      startLine: number
      startColumn: number
      endLine: number
      endColumn: number
      language: string
    }>,
    starts: number[],
    failed: Array<{ file: string; error: string }>
  ): Promise<{
    tokens: ScopeTokenResult['tokens']
    scopeSets: string[][]
    covered: Array<{ line: number; start: number; end: number }>
    applied: string[]
  }> {
    const tokens: ScopeTokenResult['tokens'] = []
    const scopeSets: string[][] = []
    const covered: Array<{ line: number; start: number; end: number }> = []
    const applied: string[] = []
    const refs = request.embedded ?? []
    if (refs.length === 0) return { tokens, scopeSets, covered, applied }

    const byLanguage = new Map<string, DynamicEmbeddedParserRef>()
    for (const ref of refs) byLanguage.set(ref.languageId.toLowerCase(), ref)

    for (const injection of injections.slice(0, MAX_EMBEDDED_RANGES)) {
      const ref = byLanguage.get(injection.language.toLowerCase())
      if (!ref) continue
      const slice = sliceRange(request.text, starts, injection)
      if (!slice) continue

      let grammar: LoadedGrammar
      try {
        grammar = await loadGrammar({ parserPath: ref.parserPath, abi: ref.abi, queries: ref.queries })
      } catch (error) {
        failed.push({
          file: ref.parserPath,
          error: error instanceof Error ? error.message : String(error)
        })
        continue
      }

      const tree = grammar.parser.parse(slice.text)
      if (!tree) continue
      try {
        const collected = collectMatches(grammar, ref.queries, tree.rootNode)
        for (const failure of collected.failed) {
          if (!failed.some((entry) => entry.file === failure.file)) failed.push(failure)
        }
        const highlightCaptures = collected.capturesByCategory.get('highlights') ?? []
        if (highlightCaptures.length === 0) continue
        const built = buildScopeTokens(highlightCaptures, slice.text)

        // Los índices de los scopes viajan por índice: al fusionar dos
        // tokenizados hay que desplazar los del tramo embebido.
        const base = scopeSets.length
        scopeSets.push(...built.scopeSets)
        for (const token of built.tokens) {
          const line = injection.startLine + token.line
          // La primera línea del tramo empieza en su columna real; las demás
          // arrancan en la columna 0 (son líneas propias del tramo).
          const start = token.line === 0 ? injection.startColumn + token.start : token.start
          const end = token.line === 0 ? injection.startColumn + token.end : token.end
          tokens.push({ line, start, end, scopes: base + token.scopes })
          covered.push({ line, start, end })
        }
        applied.push(...collected.applied)
      } finally {
        tree.delete()
      }
    }

    return { tokens, scopeSets, covered, applied }
  }

  async function tokenize(request: DynamicTokenizeRequest): Promise<DynamicTokenizeResult> {
    if (!request.parserPath) return empty('sin parser')
    const grammar = await loadGrammar({
      parserPath: request.parserPath,
      abi: request.abi,
      queries: request.queries
    })

    // El texto va como string: los índices que devuelve el parser son columnas
    // UTF-16, la misma unidad que la línea del editor (ver `scopes.ts`).
    const tree = grammar.parser.parse(request.text)
    if (!tree) return empty('el parser no devolvió árbol')

    try {
      const { capturesByCategory, matchesByCategory, applied, failed } = collectMatches(
        grammar,
        request.queries,
        tree.rootNode
      )

      const starts = lineStarts(request.text)

      // ── Color: highlights de la raíz ───────────────────────────────────
      const rootCaptures = capturesByCategory.get('highlights') ?? []
      const rootTokens = buildScopeTokens(rootCaptures, request.text)
      const scopeSets: string[][] = [...rootTokens.scopeSets]
      let tokens = rootTokens.tokens

      // ── Inyecciones: tramos de otro lenguaje ───────────────────────────
      const injectionMatches = matchesByCategory.get('injections') ?? []
      const injections = buildInjectionRanges(injectionMatches, request.text)
      const embeddedApplied: string[] = []
      if (injections.length > 0) {
        const embedded = await tokenizeEmbedded(request, injections, starts, failed)
        embeddedApplied.push(...embedded.applied)
        if (embedded.tokens.length > 0) {
          // El tokenizado embebido internó SUS scopes desde 0: al fusionar hay
          // que desplazar cada índice al espacio de scopes del resultado.
          const base = scopeSets.length
          scopeSets.push(...embedded.scopeSets)
          const rebased = embedded.tokens.map((token) => ({ ...token, scopes: base + token.scopes }))
          // Se descartan los de la raíz que pisan el tramo: el lenguaje
          // inyectado es más específico (el padre suele cubrir el bloque
          // entero como un string, y ese color tapaba el código).
          const covered = embedded.covered
          const keptRoot = tokens.filter(
            (token) =>
              !covered.some(
                (range) =>
                  range.line === token.line &&
                  token.start < range.end &&
                  range.start < token.start + (token.end - token.start)
              )
          )
          tokens = [...keptRoot, ...rebased]
        }
      }

      tokens.sort((a, b) => a.line - b.line || a.start - b.start || a.end - b.end)

      // ── Datos del árbol (símbolos, plegado, alcances, selección) ───────
      const data: DynamicSyntaxData = {
        symbols: buildSymbols(capturesByCategory.get('tags') ?? [], request.text),
        folds: buildFoldRanges(matchesByCategory.get('folds') ?? [], request.text),
        injections,
        locals: buildLocalEntries(capturesByCategory.get('locals') ?? [], request.text),
        textObjects: buildTextObjects(capturesByCategory.get('textobjects') ?? [], request.text),
        appliedCategories: APPLIED_CATEGORIES.filter((category) => {
          if (!capturesByCategory.has(category)) return false
          if (category === 'highlights') return rootCaptures.length > 0
          if (category === 'injections') return injections.length > 0
          return (capturesByCategory.get(category)?.length ?? 0) > 0
        })
      }

      return {
        ok: true,
        scopeSets,
        tokens,
        // `applied` es la lista de ARCHIVOS de query que corrieron: incluye los
        // embebidos porque el usuario ve "qué se aplicó", y saber que el parser
        // embebido también corrió explica el color de ese bloque.
        applied: [...new Set([...applied, ...embeddedApplied])],
        failed,
        data
      }
    } finally {
      tree.delete()
    }
  }

  return {
    tokenize,
    forget: (parserPath?: string) => {
      if (parserPath) grammars.delete(parserPath)
      else grammars.clear()
    }
  }
}
