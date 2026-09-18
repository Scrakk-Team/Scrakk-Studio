/**
 * Tokenizador TextMate del proceso MAIN — el que hace que la gramática de una
 * extensión de lenguaje pinte de verdad.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ CORRE ACÁ Y NO EN EL RENDERER
 *
 * 1. **Los archivos están acá.** Un `.tmLanguage` vive dentro del paquete
 *    instalado (`userData/extensions/<id>/…`). El main ya tiene la ruta y el
 *    permiso; el renderer tendría que pedir el archivo por IPC igual.
 * 2. **La leyenda de Oniguruma es un `.wasm`** (`vscode-oniguruma`): cargarlo
 *    desde el renderer obliga a versionar un binario en `public/` o a pelear
 *    con `fetch` sobre `file://`. En main se lee del paquete y listo.
 * 3. **No bloquea la UI.** Es otro proceso: tokenizar un archivo de 10k líneas
 *    no congela el editor — cumple el objetivo del "worker" del plan sin
 *    montar un worker.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ DEVUELVE (y por qué así)
 *
 * NO devuelve colores: devuelve **scopes**. El color es del tema, y el tema
 * vive en el renderer. Además el layout de token ocupa 20-30 KB por archivo y
 * los `scopes` se repiten muchísimo (decenas de miles de tokens usan los
 * mismos ~40 stacks), así que se INTERNEAN: `scopeSets[i]` + tokens que
 * apuntan a un índice. Un archivo grande viaja en un structured-clone chico.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LENGUAJES EMBEBIDOS: DOS PASADAS (inyecciones + re-tokenizado)
 *
 * Un lenguaje embebido (JS dentro de HTML, código de Gleam dentro de un bloque
 * de markdown) necesita DOS cosas, y las dos están:
 *
 *  1. **Inyecciones** (`injectTo`): la gramática ajena se aplica DENTRO de la
 *     padre, así el bloque queda marcado con su scope propio
 *     (`meta.embedded.block.gleam`). Sin esto el bloque es sólo "código" para
 *     la gramática de markdown y no hay nada que re-tokenizar — es el error
 *     clásico de implementar sólo la segunda mitad.
 *  2. **Re-tokenizado del tramo** (`embeddedLanguages`): ese scope mapea a un
 *     id de lenguaje, y su gramática tokeniza el texto del tramo con SU stack,
 *     que se conserva entre líneas (si no, un bloque multilínea se rompe en la
 *     segunda línea).
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { createRequire } from 'node:module'
import { app } from 'electron'
import { Registry, parseRawGrammar, type IGrammar, type StateStack } from 'vscode-textmate'
import * as oniguruma from 'vscode-oniguruma'

/** Una gramática que el renderer ya identificó (rutas absolutas). */
export interface TokenizeGrammarRef {
  scopeName: string
  path: string
  /** ID del lenguaje dueño (para resolver los tramos embebidos). */
  language?: string
  /** `scope` → languageId. */
  embeddedLanguages?: Record<string, string>
  /** Scopes de otros lenguajes donde esta gramática se inyecta. */
  injectTo?: string[]
}

export interface TokenizeRequest {
  /** Scope raíz del documento (`source.zig`). */
  scopeName: string
  /**
   * Todas las gramáticas que se pueden necesitar. El main NO tiene el registro
   * de lenguajes (vive en el renderer), así que acá llegan las candidatas y el
   * main se limita a verificar que cada ruta sea legible y esté dentro del
   * directorio de extensiones.
   */
  grammars: TokenizeGrammarRef[]
  text: string
}

export interface TokenizeResult {
  ok: boolean
  error?: string
  /** Stacks de scope únicos; los tokens apuntan acá por índice. */
  scopeSets: string[][]
  /** `start`/`end` en columnas UTF-16 de la línea (0-based). */
  tokens: Array<{ line: number; start: number; end: number; scopes: number }>
}

// ── Oniguruma ─────────────────────────────────────────────────────────────

let onigReady: Promise<void> | null = null

/**
 * Ruta del `.wasm` de Oniguruma.
 *
 * Se resuelve por `require.resolve` para que siga funcionando cuando la app
 * está empaquetada (el paquete queda en node_modules dentro del asar; una ruta
 * relativa al bundle se rompería). Cuando `require` no existe — el main
 * bundleado como ESM o los tests, que corren transformados — se arma un
 * resolver equivalente desde el directorio de trabajo.
 */
let resolveModule: ((id: string) => string) | null = null

function resolvePackageFile(id: string): string {
  if (!resolveModule) {
    if (typeof require === 'function' && typeof require.resolve === 'function') {
      resolveModule = (moduleId: string) => require.resolve(moduleId)
    } else {
      // Anclado al propio archivo y no al cwd: con el cwd de un arranque desde
      // el menú ($HOME) `vscode-oniguruma` no se resuelve y el tokenizador
      // TextMate de las extensiones queda muerto sin decir por qué.
      const anchor =
        typeof __filename === 'string' ? __filename : path.join(process.cwd(), 'index.js')
      resolveModule = createRequire(anchor).resolve
    }
  }
  return resolveModule(id)
}

function loadOniguruma(): Promise<void> {
  if (!onigReady) {
    onigReady = (async () => {
      const wasmPath = resolvePackageFile('vscode-oniguruma/release/onig.wasm')
      const data = await fs.readFile(wasmPath)
      await oniguruma.loadWASM({ data: new Uint8Array(data) })
    })()
    // Si falla, que se pueda reintentar en la próxima llamada en vez de
    // quedar pegado a una promesa rechazada para siempre.
    onigReady.catch(() => {
      onigReady = null
    })
  }
  return onigReady
}

// ── Seguridad de rutas ────────────────────────────────────────────────────

/**
 * Verifica que la gramática esté DENTRO de un directorio de extensiones.
 *
 * Sin esto, un manifest podría declarar `path: "/etc/passwd"` y el main lo
 * leería como gramática: el renderer pasa rutas, y una ruta que viene de un
 * manifest es dato de terceros.
 */
export async function assertGrammarPathAllowed(filePath: string): Promise<void> {
  const roots = [path.join(app.getPath('userData'), 'extensions')]
  const resolved = path.resolve(filePath)
  for (const root of roots) {
    const prefix = root.endsWith(path.sep) ? root : root + path.sep
    if (resolved.startsWith(prefix)) return
  }
  throw new Error(`gramática fuera del directorio de extensiones: ${filePath}`)
}

// ── Caché de registries y gramáticas ──────────────────────────────────────

interface CachedRegistry {
  /** Firma de las gramáticas: si cambia una ruta, se tira el registry. */
  signature: string
  registry: Registry
  grammars: Map<string, Promise<IGrammar | null>>
}

const registryCache = new Map<string, CachedRegistry>()

/** Contenido crudo cacheado por archivo+mtime (un tema trae MBs de JSON). */
const rawGrammarCache = new Map<string, { mtimeMs: number; raw: ReturnType<typeof parseRawGrammar> }>()

async function loadRawGrammar(filePath: string): Promise<ReturnType<typeof parseRawGrammar>> {
  const stat = await fs.stat(filePath)
  const cached = rawGrammarCache.get(filePath)
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.raw
  const content = await fs.readFile(filePath, 'utf-8')
  const raw = parseRawGrammar(content, filePath)
  rawGrammarCache.set(filePath, { mtimeMs: stat.mtimeMs, raw })
  return raw
}

function getRegistry(rootScopeName: string, refs: TokenizeGrammarRef[]): CachedRegistry {
  const byScope = new Map(refs.map((ref) => [ref.scopeName, ref.path]))
  const signature = [...byScope.entries()]
    .sort()
    .map(([scope, file]) => `${scope}=${file}`)
    .join('|')

  // Inyecciones: scope destino → gramáticas que se meten dentro.
  // `text.html.markdown` recibe `markdown.gleam.codeblock`, etc.
  const injections = new Map<string, string[]>()
  for (const ref of refs) {
    for (const target of ref.injectTo ?? []) {
      const list = injections.get(target) ?? []
      if (!list.includes(ref.scopeName)) list.push(ref.scopeName)
      injections.set(target, list)
    }
  }

  const key = rootScopeName
  const cached = registryCache.get(key)
  if (cached && cached.signature === signature) return cached
  if (cached) registryCache.delete(key)

  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
      createOnigString: (s: string) => new oniguruma.OnigString(s)
    }),
    loadGrammar: async (scopeName: string) => {
      const filePath = byScope.get(scopeName)
      if (!filePath) return null
      return loadRawGrammar(filePath)
    },
    getInjections: (scopeName: string) => injections.get(scopeName)
  })

  const entry: CachedRegistry = { signature, registry, grammars: new Map() }
  registryCache.set(key, entry)
  return entry
}

async function getGrammar(
  registry: Registry,
  cache: Map<string, Promise<IGrammar | null>>,
  scopeName: string
): Promise<IGrammar | null> {
  const existing = cache.get(scopeName)
  if (existing) return existing
  const pending = registry.loadGrammar(scopeName)
  cache.set(scopeName, pending)
  return pending
}

// ── Tokenización ──────────────────────────────────────────────────────────

/**
 * Divide el texto en líneas EXACTAMENTE como lo hace el motor.
 *
 * El buffer de Innerta se arma con `getline` sobre `\n` y descartando un `\r`
 * final, así que la línea N de acá tiene que ser la línea N de allá. Con un
 * `split` propio eso se garantiza; usando `lines` de otra librería, no.
 */
function splitLines(text: string): string[] {
  const out = text.split('\n')
  for (let i = 0; i < out.length; i++) {
    if (out[i].endsWith('\r')) out[i] = out[i].slice(0, -1)
  }
  return out
}

export async function tokenizeText(request: TokenizeRequest): Promise<TokenizeResult> {
  const empty: TokenizeResult = { ok: false, scopeSets: [], tokens: [] }
  try {
    if (!request.scopeName || request.grammars.length === 0) {
      return { ...empty, error: 'sin gramática' }
    }
    for (const ref of request.grammars) {
      await assertGrammarPathAllowed(ref.path)
    }

    await loadOniguruma()

    const { registry, grammars } = getRegistry(request.scopeName, request.grammars)
    const grammar = await getGrammar(registry, grammars, request.scopeName)
    if (!grammar) return { ...empty, error: `no se pudo cargar la gramática ${request.scopeName}` }

    const lines = splitLines(request.text)
    const scopeSets: string[][] = []
    const scopeIndex = new Map<string, number>()
    const tokens: TokenizeResult['tokens'] = []

    /** Internea un stack de scopes: devuelve su índice. */
    const internScopes = (scopes: readonly string[]): number => {
      const key = scopes.join(' ')
      const found = scopeIndex.get(key)
      if (found !== undefined) return found
      const index = scopeSets.length
      scopeSets.push([...scopes])
      scopeIndex.set(key, index)
      return index
    }

    const rootRef = request.grammars.find((ref) => ref.scopeName === request.scopeName)
    const embeddedLanguages = rootRef?.embeddedLanguages ?? {}
    const embeddedEntries = Object.entries(embeddedLanguages)
    /** languageId → scopeName, para encontrar la gramática de un tramo. */
    const scopeByLanguage = new Map<string, string>()
    for (const ref of request.grammars) {
      if (ref.language && !scopeByLanguage.has(ref.language)) {
        scopeByLanguage.set(ref.language, ref.scopeName)
      }
    }

    /** Un tramo de la línea que pertenece a otro lenguaje. */
    interface Region {
      line: number
      start: number
      end: number
      languageId: string
    }
    const regions: Region[] = []

    let ruleStack: StateStack | null = null
    for (let line = 0; line < lines.length; line++) {
      const result = grammar.tokenizeLine(lines[line], ruleStack)
      ruleStack = result.ruleStack

      let col = 0
      for (const token of result.tokens) {
        // El tokenizador entrega rangos en columnas UTF-16 sobre la línea, que
        // es la misma unidad que usa el motor: no hay conversión que hacer.
        const start = token.startIndex
        const end = token.endIndex
        if (end <= start || start < col) continue
        col = end

        const embedded = embeddedEntries.find(([scope]) =>
          token.scopes.some((s) => s === scope || s.startsWith(scope + '.'))
        )
        if (embedded && scopeByLanguage.has(embedded[1])) {
          // El tramo va a la segunda pasada: acá NO se emite token con los
          // scopes del padre (sería el color equivocado).
          regions.push({ line, start, end, languageId: embedded[1] })
          continue
        }
        tokens.push({ line, start, end, scopes: internScopes(token.scopes) })
      }
    }

    // ── Segunda pasada: tramos embebidos, con stack por lenguaje ──────────
    // El stack se CONSERVA mientras el tramo siga en la línea siguiente (un
    // bloque multilínea se tokeniza como una unidad). Si el tramo se corta, el
    // stack se resetea: el siguiente bloque arranca limpio.
    const stacks = new Map<string, { stack: StateStack | null; lastLine: number }>()
    for (const region of regions) {
      const scopeName = scopeByLanguage.get(region.languageId)
      if (!scopeName) continue
      const embeddedGrammar = await getGrammar(registry, grammars, scopeName)
      if (!embeddedGrammar) continue

      const previous = stacks.get(region.languageId)
      const continues = previous && previous.lastLine === region.line - 1
      const text = lines[region.line].slice(region.start, region.end)
      const result = embeddedGrammar.tokenizeLine(text, continues ? previous.stack : null)
      stacks.set(region.languageId, { stack: result.ruleStack, lastLine: region.line })

      let col = 0
      for (const token of result.tokens) {
        const start = region.start + token.startIndex
        const end = region.start + token.endIndex
        if (end <= start || start < col) continue
        col = end
        tokens.push({ line: region.line, start, end, scopes: internScopes(token.scopes) })
      }
    }

    // Las dos pasadas escriben en orden de línea pero no globalmente: el
    // renderer espera tokens ordenados (así los deltas del payload salen bien).
    tokens.sort((a, b) => (a.line !== b.line ? a.line - b.line : a.start - b.start))

    return { ok: true, scopeSets, tokens }
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Para tests: sin esto, un caso deja el cache contaminado para el siguiente. */
export function resetTokenizerCaches(): void {
  registryCache.clear()
  rawGrammarCache.clear()
}
