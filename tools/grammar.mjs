#!/usr/bin/env node
/**
 * grammar.mjs — pasame un link y la gramática queda andando.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ HACE (en una línea)
 *
 *   link  →  bajar  →  detectar lenguaje/queries  →  compilar a .wasm  →
 *   empaquetar .sef  →  instalar en la app (y/o embeber en el engine).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 *
 * Agregar un lenguaje tenía tres pasos manuales y dos de ellos se hacían distinto
 * cada vez: clonar el repo del parser a mano, compilar el wasm con las flags
 * exactas que espera el cargador, y armar el manifest del paquete enumerando las
 * queries. Cualquier paso mal hecho no falla con un error: el archivo se abre sin
 * color y el motor no dice por qué.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LOS DOS DESTINOS
 *
 *  `--target app`    Paquete SEF de lenguaje (`.sef`) que se instala en
 *                    `userData/extensions/<id>/`. El parser corre en el worker
 *                    de tree-sitter dinámico, en un proceso aparte. No requiere
 *                    recompilar nada: se instala y funciona. Es el camino rápido
 *                    para probar una gramática nueva.
 *
 *  `--target engine` Embeber la gramática en el `.wasm` del motor: además del
 *                    parser, el motor la usa con su propio runtime (el camino
 *                    "de fábrica" de los lenguajes que ya trae). Con `--build`
 *                    es UN comando: regenera los fragmentos del wasm, recompila
 *                    con emscripten y deja `innerta.wasm` en el renderer. Sólo
 *                    corre en una máquina con el checkout del engine + emsdk.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUERIES: QUÉ SE INSTALA Y DE DÓNDE SALE
 *
 * El repo del parser publica lo que quiere (medido sobre los 18 lenguajes del
 * motor: `folds.scm` 0/18, `indents` 0/18, `textobjects` 0/18). El CLI resuelve
 * cada categoría en este orden y lo REPORTA:
 *
 *   1. ajuste propio  `deps/queries-overrides/<símbolo>/<categoría>.scm`
 *   2. repo del parser (upstream)
 *   3. suplemento     nvim-treesitter, fijado por commit (Apache-2.0)
 *
 * Lo que se bajó del suplemento se guarda en el directorio de ajustes: la próxima
 * corrida no necesita red y el mismo archivo sirve para el paquete SEF y para el
 * motor. La procedencia de cada query queda en el `grammar.json` del paquete, y
 * lo que no se pudo traer se declara (`missingCategories`) en vez de dejar creer
 * que el dato existe. `--verify` convierte "esta query no produce nada" en un
 * error de instalación.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HERENCIA DE QUERIES (`; inherits: javascript`)
 *
 * Los repos publican queries INCOMPLETAS a propósito cuando un lenguaje es un
 * superconjunto de otro: `tree-sitter-typescript/queries/highlights.scm` trae
 * sólo los agregados de TS (515 bytes) y espera que quien lo consume junte la
 * base de JavaScript. El paquete SEF se resuelve al ARMARLO (el cargador del
 * worker no entiende la directiva): con `--inherits javascript` (o la directiva
 * dentro del archivo) la query viaja ya fusionada, base primero.
 *
 *   node tools/grammar.mjs https://github.com/tree-sitter/tree-sitter-typescript \
 *     --parser typescript --inherits javascript --install
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LO QUE NO HACE (a propósito)
 *
 *  - Parsers NATIVOS (`.so`/`.dll`): el paquete los declara con `native: true` y
 *    el worker los rechaza hasta que exista el proceso aislado + consentimiento.
 *  - Lenguajes que el motor ya trae compilados: los carga el engine, no el
 *    paquete. Un `--target app` de `rust` igual funciona (el paquete pisa al
 *    motor por prioridad), pero es el camino largo para algo que ya está.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as os from 'node:os'
import * as path from 'node:path'
// La categoría de cada `.scm` la decide el MISMO módulo que usa el IDE
// (`categorizeQueryFile`), no una copia: si acá se clasificara distinto, el
// reporte diría "folds instalado" y el worker lo leería como `unknown`. Node
// ≥22.18/23.6 importa `.ts` directamente (type stripping), que es el Node con
// el que corre este CLI.
import { categorizeQueryFile, capturesOf } from '../src/shared/syntax/queries.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(HERE, '..')
const DEFAULT_ENGINE_DIR = path.resolve(PROJECT_ROOT, '..', 'InnertaEngine', 'InnertaEngine-Linux')
/** Nombre con el que Electron guarda el `userData` (ver `app.setName`). */
export const APP_NAME = 'scrakk-studio'
/** Firma de ABI que se declara en el manifest del paquete. */
export const ABI_PREFIX = 'tree-sitter-abi-'

// ═══════════════════════════════════════════════════════════════════════════
// Parte pura (se testea sin tocar red ni disco)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Qué es el link que pasaron.
 *
 * Se acepta lo que la gente tiene a mano:
 *
 *   https://github.com/<owner>/<repo>[#ref]   → `git`
 *   <pkg> | @scope/pkg[@ver]                  → `npm` (los parsers se publican)
 *   https://…/x.wasm | ./x.wasm               → `wasm` (ya compilado)
 *   ./ruta | /ruta                            → `dir` (un checkout local)
 */
export function parseLink(input) {
  const raw = String(input ?? '').trim()
  if (!raw) throw new Error('falta el link de la gramática')

  if (/\.wasm$/i.test(raw) && !/^https?:\/\//i.test(raw)) {
    return { kind: 'wasm', path: path.resolve(raw) }
  }
  if (/^https?:\/\//i.test(raw)) {
    if (/\.wasm(\?|$)/i.test(raw)) return { kind: 'wasm', url: raw }
    const url = new URL(raw)
    if (!/(^|\.)github\.com$/i.test(url.hostname)) {
      // Cualquier otro git sirve igual: se clona y se mira qué hay adentro.
      return { kind: 'git', url: raw, ref: null }
    }
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) throw new Error(`URL de repo incompleta: ${raw}`)
    const slug = `${parts[0]}/${parts[1]}`
    // `#v0.2.0` o `/tree/<ref>/<subruta>`
    let ref = url.hash ? url.hash.slice(1) : null
    let subpath = null
    if (parts[2] === 'tree' && parts[3]) {
      ref = ref ?? parts[3]
      if (parts.length > 4) subpath = parts.slice(4).join('/')
    }
    return { kind: 'git', url: `https://github.com/${slug}.git`, slug, ref, subpath }
  }
  if (fs.existsSync(raw)) {
    return { kind: 'dir', path: path.resolve(raw) }
  }
  if (/^(@[^/]+\/)?[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?(@[^@]+)?$/i.test(raw)) {
    return { kind: 'npm', spec: raw }
  }
  throw new Error(`no entiendo el link "${raw}" (¿un git, un paquete npm, un .wasm o una ruta?)`)
}

/** `c_sharp` → `c-sharp`? No: el nombre del lenguaje se usa tal cual lo declara el repo. */
export function languageFromSymbol(symbol) {
  return String(symbol).replace(/^tree_sitter_/, '').replace(/_/g, '-')
}

/** Símbolo exportado por un `parser.c` generado (`tree_sitter_javascript`). */
export function symbolFromParserC(source) {
  const definition = /tree_sitter_([A-Za-z0-9_]+)\s*\(\s*void\s*\)\s*\{/.exec(source)
  if (definition) return definition[1]
  const anyMention = /tree_sitter_([A-Za-z0-9_]+)/.exec(source)
  if (!anyMention) throw new Error('el parser.c no declara ningún símbolo tree_sitter_*')
  return anyMention[1]
}

/** ABI del lenguaje tal como la declara el parser generado. */
export function abiFromParserC(source) {
  const match = /#define\s+LANGUAGE_VERSION\s+(\d+)/.exec(source)
  return match ? Number(match[1]) : null
}

/**
 * Candidatos a parser dentro de lo que se bajó.
 *
 * Casi todos los repos tienen `src/parser.c`, pero los monorepos (TypeScript,
 * markdown, php) tienen un subdirectorio por lenguaje. Se devuelven TODOS: elegir
 * uno cuando hay varios es una decisión del usuario (`--parser`), no del CLI.
 */
export function parserCandidates(root) {
  const out = []
  const walk = (dir, depth) => {
    if (depth > 4) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules' || entry.name === 'test' || entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.name === 'src' && fs.existsSync(path.join(full, 'parser.c'))) {
        out.push({
          dir: full,
          relative: path.relative(root, full),
          symbol: symbolFromParserC(fs.readFileSync(path.join(full, 'parser.c'), 'utf8'))
        })
        continue
      }
      walk(full, depth + 1)
    }
  }
  walk(root, 0)
  return out.sort((a, b) => a.relative.localeCompare(b.relative))
}

/** Elige el candidato pedido, o el único que hay. */
export function selectParser(candidates, hint) {
  if (candidates.length === 0) throw new Error('no se encontró ningún src/parser.c en lo que se bajó')
  if (hint) {
    const wanted = hint.replace(/^\.\//, '').replace(/\/src$/, '')
    const found = candidates.find(
      (c) => c.relative === `${wanted}/src` || c.symbol === hint || c.relative.replace(/\/src$/, '') === wanted
    )
    if (!found) {
      const list = candidates.map((c) => c.relative.replace(/\/src$/, '')).join(', ')
      throw new Error(`--parser ${hint} no existe (hay: ${list})`)
    }
    return found
  }
  if (candidates.length > 1) {
    const list = candidates.map((c) => c.relative.replace(/\/src$/, '')).join(', ')
    throw new Error(`este repo trae varios parsers (${list}): decime cuál con --parser <nombre>`)
  }
  return candidates[0]
}

/**
 * Queries que le corresponden a un parser.
 *
 * Tres layouts reales, en orden de precedencia:
 *   1. `<repo>/<sub>/queries/*.scm`   (subrepo con carpeta propia: markdown)
 *   2. `<repo>/queries/<sub>/*.scm`   (queries por lenguaje en un monorepo)
 *   3. `<repo>/queries/*.scm`         (el caso normal, y el de TS para typescript/tsx)
 *
 * Devuelve rutas RELATIVAS a la raíz del paquete (lo que el manifest referencia)
 * junto con su ruta absoluta para leerlas.
 */
export function queryFiles(root, parserRelative) {
  // Un parser anidado (`tree-sitter-markdown/src`, `tsx/src`) es el único caso en
  // el que los layouts 1 y 2 pueden aplicar. La versión anterior de este cálculo
  // nunca daba "anidado" (`path.dirname(parserRelative) === '.'` sólo para 'src'),
  // así que el layout 1 estaba muerto y un repo con subcarpetas propias se
  // instalaba SIN queries del upstream (markdown: 0 archivos → los suplementos
  // pisaban en silencio el highlights del repo).
  const nested = parserRelative.includes('/')
  const subName = parserRelative.split('/')[0]
  const candidates = []
  // 1. `<repo>/<sub>/queries/*.scm`   (subrepo con carpeta propia: markdown)
  if (nested) candidates.push(path.join(root, subName, 'queries'))
  // 2. `<repo>/queries/<sub>/*.scm`   (queries por lenguaje en un monorepo)
  if (nested) candidates.push(path.join(root, 'queries', subName))
  // 3. `<repo>/queries/*.scm`         (el caso normal)
  candidates.push(path.join(root, 'queries'))

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue
    const files = []
    const walk = (current, prefix) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name)
        if (entry.isDirectory()) walk(full, path.join(prefix, entry.name))
        else if (entry.name.endsWith('.scm')) files.push({ relative: path.join(prefix, entry.name), absolute: full })
      }
    }
    walk(dir, 'queries')
    if (files.length > 0) return files.sort((a, b) => a.relative.localeCompare(b.relative))
  }
  return []
}

/** Extensiones de archivo y alias que declara el repo (`tree-sitter.json`, package.json). */
export function languageMetadata(root, symbol) {
  const meta = { extensions: [], aliases: [], version: '1.0.0' }
  const readJson = (file) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
    } catch {
      return null
    }
  }

  const pkg = readJson('package.json')
  if (pkg?.version) meta.version = String(pkg.version)
  // `tree-sitter.json` (formato nuevo) trae file-types por gramática.
  const tsJson = readJson('tree-sitter.json')
  const grammars = Array.isArray(tsJson?.grammars) ? tsJson.grammars : []
  const mine = grammars.find((g) => g && (g.name === symbol || g.camelcase === symbol))
  const fileTypes = mine?.['file-types']
  if (Array.isArray(fileTypes)) {
    meta.extensions = fileTypes.filter((t) => typeof t === 'string' && /^[A-Za-z0-9_.+-]+$/.test(t))
  }
  // `package.json > tree-sitter` (formato viejo, mismo dato).
  const legacy = pkg?.['tree-sitter']
  const legacyEntry = Array.isArray(legacy) ? legacy.find((g) => g?.scope) : legacy
  if (meta.extensions.length === 0 && Array.isArray(legacyEntry?.['file-types'])) {
    meta.extensions = legacyEntry['file-types'].filter((t) => typeof t === 'string')
  }
  if (typeof mine?.description === 'string') meta.aliases.push(mine.description)
  return meta
}

/**
 * Extensiones que declara una extensión de lenguaje YA INSTALADA en la app.
 *
 * Es una fuente real y no una tabla nuestra: si el usuario instaló (o tradujo de
 * VS Code) una extensión de lenguaje, ahí está la asociación de archivos que el
 * propio IDE usa. Un paquete de parser no la trae: `tree-sitter-elixir` de npm no
 * declara `.ex`/`.exs` en ningún lado.
 */
export function extensionsFromInstalledPackages(profileDir, language) {
  for (const dir of installedExtensions(profileDir)) {
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    } catch {
      continue
    }
    // Un paquete del propio CLI se IGNORA: si una vez se instaló con las
    // extensiones mal, leerlo acá las perpetúa (se leería a sí mismo y la
    // corrección nunca entraría). Estos paquetes son de parsing, no definiciones
    // de lenguaje.
    if (manifest?.author === 'scrakk-grammar') continue
    const languages = manifest?.contributes?.languages
    if (!Array.isArray(languages)) continue
    for (const entry of languages) {
      if (entry?.id !== language) continue
      if (Array.isArray(entry.extensions) && entry.extensions.length > 0) return entry.extensions.map(String)
    }
  }
  return []
}

/** `ts` → `.ts` (el registro de lenguajes compara con `endsWith`). */
export function normalizeExtensions(extensions, language) {
  const list = (extensions ?? [])
    .map((ext) => String(ext).trim().toLowerCase())
    .filter(Boolean)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))
  return list.length > 0 ? Array.from(new Set(list)) : [`.${language}`]
}

/**
 * Fusiona una query con su base (base PRIMERO).
 *
 * El orden no es cosmético: el motor pinta un carácter con el primer capture que
 * gana, así que la base entra antes para que lo específico del lenguaje pueda
 * pisarla. Es el mismo orden que resuelve el motor con `inherits:` (que el
 * cargador del worker no entiende, por eso acá se resuelve al empacar).
 */
export function mergeInheritedQueries(own, base) {
  const withoutDirective = String(own).replace(/^[ \t]*;[ \t]*inherits:.*\r?\n/m, '')
  return `${base.trimEnd()}\n\n; ── heredado de la base ──\n${withoutDirective}`
}

/** Lenguajes base declarados en la cabecera de una query (sólo comentarios). */
export function declaredInherits(content) {
  for (const line of String(content).split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (!trimmed.startsWith(';')) break
    const match = /^;[ \t]*inherits:[ \t]*([A-Za-z0-9_, -]+)$/.exec(trimmed)
    if (match) return match[1].split(/[\s,]+/).filter(Boolean)
  }
  return []
}

/**
 * Resuelve la herencia de una query de forma TRANSITIVA.
 *
 * `; inherits: base` no siempre apunta a una query autocontenida: la cadena real
 * es `tsx → typescript → javascript`, y en el catálogo de nvim pasa lo mismo
 * (`javascript/folds.scm` es SÓLO la directiva `; inherits: ecma,jsx`).
 * Fusionar un solo nivel dejaba el archivo sin captures: se instalaba "folds" y
 * la verificación cantaba cero — o peor, sin verificación quedaba un archivo
 * vacío que plegaba por sangría sin que nadie supiera por qué.
 *
 * Es PURA: `fetchBase(base)` devuelve el texto de la base (o null) y las pruebas
 * la ejercitan sin red ni disco. `seen` corta los ciclos y `depth` la recursión.
 */
export function resolveInheritChain(content, fetchBase, options = {}) {
  const seen = options.seen ? new Set(options.seen) : new Set()
  const depth = options.depth ?? 0
  const bases = declaredInherits(content)
  if (bases.length === 0 || depth >= 4) return content
  let merged = content
  for (const base of bases) {
    if (seen.has(base)) continue
    seen.add(base)
    const baseContent = fetchBase(base)
    if (!baseContent) continue
    const chain = resolveInheritChain(baseContent, fetchBase, { seen, depth: depth + 1 })
    merged = mergeInheritedQueries(merged, chain)
  }
  return merged
}

/** El manifest del paquete SEF de lenguaje. */
export function buildManifest({ language, aliases, extensions, version, queries, abi, sha256, packageId, name, source }) {
  return {
    id: packageId,
    name: name ?? `${aliases?.[0] ?? language} (tree-sitter)`,
    version: version ?? '1.0.0',
    author: 'scrakk-grammar',
    description: `Gramática tree-sitter de ${language} compilada a wasm${source ? ` desde ${source}` : ''}`,
    contributes: {
      languages: [
        {
          id: language,
          aliases: aliases?.length ? aliases : [language],
          extensions: normalizeExtensions(extensions, language),
          grammars: [
            {
              kind: 'treeSitter',
              parser: `grammars/${language}.wasm`,
              queries: queries.map((q) => q.relative),
              ...(abi ? { abi: `${ABI_PREFIX}${abi}` } : {}),
              ...(sha256 ? { sha256 } : {})
            }
          ]
        }
      ]
    }
  }
}

/** `tree-sitter-javascript` → `javascript`; `gleam` → `tree-sitter-gleam`. */
export function repoNameFor(language, link) {
  if (link?.kind === 'git' && link.slug) return link.slug.split('/')[1]
  // Un checkout LOCAL ya está en `deps/languages/<repoName>`: el nombre real del
  // repo está en su carpeta, y deducirlo del lenguaje lo rompe donde no coinciden
  // (`c_sharp` → `tree-sitter-c_sharp` ≠ `tree-sitter-c-sharp`). Como el registry
  // del engine se busca por ese nombre, un repoName inventado crearía una entrada
  // nueva (y el lenguaje desaparecería del wasm).
  if (link?.kind === 'dir') {
    const base = path.basename(link.path ?? '')
    if (base.startsWith('tree-sitter-')) return base
  }
  return `tree-sitter-${language}`
}

/**
 * La entrada del registry del engine para un lenguaje nuevo.
 *
 * Es la misma forma que ya usa `deps/languages.json` (ver `LanguageConfig` en
 * `tools/tui`): el generador recorre `deps/languages/<repoName>/` buscando
 * `src/parser.c`, con lo que un monorepo queda cubierto por una sola entrada.
 *
 * `queries` es la lista de `plan.entries` (con `relative`): se guardan relativas
 * a `queries/`, que es como las consume el engine.
 */
export function engineRegistryEntry({ language, repoName, repoUrl, queries, hasScannerC, hasScannerCC }) {
  return {
    name: language,
    repoName,
    repoUrl: repoUrl ?? '',
    hasScannerC: Boolean(hasScannerC),
    hasScannerCC: Boolean(hasScannerCC),
    queries: engineQueryNames(queries),
    active: true
  }
}

/** Agrega (o reemplaza) la entrada de un lenguaje en el registry, sin tocar el resto. */
export function upsertRegistry(registry, entry) {
  const languages = Array.isArray(registry?.languages) ? registry.languages.slice() : []
  // Solo por `name`: `repoName` NO sirve como clave porque un monorepo puede
  // traer varios lenguajes (hcl + dialects/terraform) y uno pisaba al otro.
  const index = languages.findIndex((l) => l.name === entry.name)
  if (index >= 0) languages[index] = { ...languages[index], ...entry }
  else languages.push(entry)
  return { languages }
}

/** Directorio de extensiones de la app (`userData/extensions`). */
export function profileExtensionsDir(platform, env, appName = APP_NAME) {
  if (platform === 'win32') return path.join(env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), appName, 'extensions')
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', appName, 'extensions')
  return path.join(env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), appName, 'extensions')
}

/** Nombre del runtime de tree-sitter que hay que usar para compilar (header + ABI). */
export function runtimeCandidates(engineDir, explicit) {
  const out = []
  if (explicit) out.push(explicit)
  if (engineDir) {
    out.push(path.join(engineDir, 'deps', 'tree-sitter', 'lib', 'include'))
    out.push(path.join(engineDir, 'deps', 'tree-sitter', 'lib', 'src'))
  }
  return out
}

/**
 * Dónde está el header que `parser.c` incluye (`"tree_sitter/parser.h"`).
 *
 * El header viaja de tres formas distintas según de dónde venga el runtime, y
 * `parser.c` no cambia: `<dir>/tree_sitter/parser.h` (como lo publica un parser
 * de npm), o PLANO en `<dir>/parser.h` (el checkout del engine). Adivinar una
 * sola de las dos formas hace fallar la compilación con un error de include que
 * no dice nada sobre cuál de las dos falta.
 */
export function findRuntimeHeaders(runtimeDirs) {
  for (const dir of runtimeDirs) {
    const nested = path.join(dir, 'tree_sitter', 'parser.h')
    if (fs.existsSync(nested)) return { parserHeader: nested, includeDir: nested.replace(/tree_sitter\/parser\.h$/, '') }
    const flat = path.join(dir, 'parser.h')
    if (fs.existsSync(flat)) return { parserHeader: flat, includeDir: dir }
  }
  return null
}

/**
 * Versiones de ABI que acepta el runtime con el que se va a compilar.
 *
 * Un parser compilado contra una ABI que el cargador no acepta no falla al
 * compilar: falla al CARGAR, con "Incompatible language version". Medirlo antes
 * ahorra el viaje (y explica por qué un paquete viejo de npm no sirve).
 */
export function readRuntimeAbi(apiHeader) {
  try {
    const source = fs.readFileSync(apiHeader, 'utf8')
    const max = /#define\s+TREE_SITTER_LANGUAGE_VERSION\s+(\d+)/.exec(source)
    const min = /#define\s+TREE_SITTER_MIN_COMPATIBLE_LANGUAGE_VERSION\s+(\d+)/.exec(source)
    return { min: min ? Number(min[1]) : null, max: max ? Number(max[1]) : null }
  } catch {
    return null
  }
}

/** Flags de emcc para un módulo lateral (lo que `Language.load` espera). */
export function wasmBuildArgs({ parserC, scanner, includeDirs, symbol, out }) {
  const args = [
    '-O3',
    '-fPIC',
    // SIDE_MODULE=2: sólo se exporta lo listado. Es el contrato de
    // `web-tree-sitter.loadWebAssemblyModule` (sección `dylink.0`).
    '-sSIDE_MODULE=2',
    '-sWASM_BIGINT=1',
    `-sEXPORTED_FUNCTIONS=_tree_sitter_${symbol}`,
    '-I',
    path.dirname(parserC),
    ...includeDirs.flatMap((dir) => ['-I', dir]),
    parserC,
    ...(scanner ? [scanner] : []),
    '-o',
    out
  ]
  return args
}

// ═══════════════════════════════════════════════════════════════════════════
// IO: bajar, compilar, colocar
// ═══════════════════════════════════════════════════════════════════════════

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: options.quiet ? 'pipe' : 'inherit', encoding: 'utf8', ...options })
  if (result.error) throw new Error(`${command} no se pudo ejecutar: ${result.error.message}`)
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.quiet ? `\n${(result.stderr ?? '').toString().trim()}` : ''
    throw new Error(`${command} ${args.join(' ')} falló (código ${result.status})${detail}`)
  }
  return result
}

/** Trae la gramática a un directorio temporal. Devuelve `{ dir, cleanup, source }`. */
async function fetchSource(link, scratch, log) {
  const tmp = fs.mkdtempSync(path.join(scratch, 'grammar-'))
  const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true })

  if (link.kind === 'dir') {
    log(`usando el checkout local ${link.path}`)
    return { dir: link.path, cleanup: () => {}, source: link.path }
  }

  if (link.kind === 'git') {
    const args = ['clone', '--depth', '1', '--quiet']
    if (link.ref) args.push('--branch', link.ref)
    args.push(link.url, tmp)
    log(`git clone ${link.url}${link.ref ? `#${link.ref}` : ''}`)
    run('git', args, { quiet: true })
    const dir = link.subpath ? path.join(tmp, link.subpath) : tmp
    if (!fs.existsSync(dir)) throw new Error(`la subruta ${link.subpath} no existe en el repo`)
    const commit = run('git', ['-C', tmp, 'rev-parse', 'HEAD'], { quiet: true }).stdout.trim()
    return { dir, cleanup, source: `${link.url}#${commit}` }
  }

  if (link.kind === 'npm') {
    log(`npm pack ${link.spec}`)
    const packed = run('npm', ['pack', link.spec, '--silent', '--pack-destination', tmp], { quiet: true })
      .stdout.trim()
      .split('\n')
      .filter(Boolean)
      .pop()
    const tarball = path.join(tmp, packed)
    if (!fs.existsSync(tarball)) throw new Error(`npm pack no produjo un tarball (¿existe ${link.spec}?)`)
    const extract = path.join(tmp, 'pkg')
    fs.mkdirSync(extract, { recursive: true })
    run('tar', ['-xzf', tarball, '-C', extract, '--strip-components=1'], { quiet: true })
    return { dir: extract, cleanup, source: `npm:${link.spec}` }
  }

  throw new Error(`no se puede "bajar" un link de tipo ${link.kind}`)
}

/** Baja un `.wasm` ya compilado (link directo o ruta). */
async function fetchWasm(link, scratch, log) {
  const dir = fs.mkdtempSync(path.join(scratch, 'grammar-wasm-'))
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true })
  if (link.path) return { wasm: link.path, cleanup, source: link.path }
  const out = path.join(dir, `parser-${Date.now()}.wasm`)
  log(`descargando ${link.url}`)
  const response = await fetch(link.url)
  if (!response.ok) throw new Error(`la descarga falló: HTTP ${response.status}`)
  fs.writeFileSync(out, Buffer.from(await response.arrayBuffer()))
  return { wasm: out, cleanup, source: link.url }
}

/** `emcc` del PATH, el de `EMCC`, o el de un emsdk (que se activa en un bash). */
function resolveEmcc(log) {
  const explicit = process.env.EMCC
  if (explicit && fs.existsSync(explicit)) return { command: explicit, activate: null }
  if (spawnSync('emcc', ['--version'], { stdio: 'ignore' }).status === 0) return { command: 'emcc', activate: null }

  const emsdk = process.env.EMSDK ?? path.join(os.homedir(), 'emsdk')
  const envScript = path.join(emsdk, 'emsdk_env.sh')
  if (fs.existsSync(envScript)) {
    log(`activando emsdk (${envScript})`)
    return { command: 'emcc', activate: `source "${envScript}" >/dev/null 2>&1` }
  }
  throw new Error(
    'no encuentro emcc: instalá emscripten (emsdk) o pasá EMCC=/ruta/al/emcc (el motor lo usa desde ~/emsdk)'
  )
}

/** Compila el parser a un módulo lateral `.wasm`. */
function buildParserWasm({ parserCandidate, includeDirs, out, emcc, log }) {
  const parserC = path.join(parserCandidate.dir, 'parser.c')
  const cppScanner = ['scanner.cc', 'scanner.cpp', 'scanner.cxx'].find((f) =>
    fs.existsSync(path.join(parserCandidate.dir, f))
  )
  const cScanner = ['scanner.c'].find((f) => fs.existsSync(path.join(parserCandidate.dir, f)))
  const scanner = cppScanner ? path.join(parserCandidate.dir, cppScanner) : cScanner ? path.join(parserCandidate.dir, cScanner) : null

  const args = wasmBuildArgs({ parserC, scanner, includeDirs, symbol: parserCandidate.symbol, out })
  // Un scanner en C++ necesita el driver de C++ (y las dos flags que suelen
  // pedir los scanners de tree-sitter).
  const command = cppScanner ? 'em++' : emcc.command
  const finalArgs = cppScanner ? ['-fno-exceptions', '-fno-rtti', ...args] : args

  log(`compilando ${path.basename(path.dirname(parserCandidate.dir))}/parser.c → ${path.basename(out)}`)
  if (emcc.activate) {
    run('bash', ['-lc', `${emcc.activate} && exec ${command} "$@"`, '--', ...finalArgs])
  } else {
    run(command, finalArgs)
  }
  if (!fs.existsSync(out)) throw new Error('emcc terminó sin error pero no dejó el .wasm')
  return { scanner: scanner ? path.basename(scanner) : null }
}

/**
 * Busca la query de un lenguaje BASE para fusionarla al armar el paquete.
 *
 * Los lenguajes base son los que el engine ya tiene (o un paquete instalado): la
 * base de TypeScript es JavaScript, y la de TSX es TypeScript. Sin encontrarla se
 * avisa y se sigue: mejor una query a medias que un comando que no corre.
 */
/**
 * Ruta de una query base (`; inherits:`) en disco, o `null`.
 *
 * Se busca en el caché de suplementos, en los checkouts del engine y en las
 * extensiones instaladas. `overridesRoot` (el padre del directorio de overrides
 * DEL lenguaje) permite encontrar las bases que `seedInheritedBases` bajó,
 * incluso sin checkout del engine (destino `dist/`).
 */
function baseQueryPath({ base, relative, engineDir, profileDir, overridesRoot }) {
  const fileName = path.basename(relative)
  const roots = []
  if (overridesRoot) roots.push(path.join(overridesRoot, base))
  if (engineDir) {
    roots.push(path.join(engineDir, 'deps', 'queries-overrides', base))
    roots.push(path.join(engineDir, 'deps', 'languages', `tree-sitter-${base}`, 'queries'))
  }
  for (const ext of installedExtensions(profileDir)) {
    roots.push(path.join(ext, 'queries'))
  }
  for (const root of roots) {
    const candidate = path.join(root, fileName)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function findBaseQuery({ base, relative, engineDir, profileDir, overridesRoot, log }) {
  const candidate = baseQueryPath({ base, relative, engineDir, profileDir, overridesRoot })
  if (candidate) return fs.readFileSync(candidate, 'utf8')
  log(`aviso: no encontré la query base "${path.basename(relative)}" de "${base}" para fusionar`)
  return null
}

function installedExtensions(profileDir) {
  if (!profileDir || !fs.existsSync(profileDir)) return []
  try {
    return fs
      .readdirSync(profileDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(profileDir, entry.name))
  } catch {
    return []
  }
}

/** Prepara los archivos del paquete en memoria: manifest + wasm + queries. */
export function packageFiles({ manifest, wasm, queryContents, provenance }) {
  return new Map([
    ['manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
    ['grammar.json', Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`)],
    [manifest.contributes.languages[0].grammars[0].parser, fs.readFileSync(wasm)],
    ...Object.entries(queryContents).map(([relative, content]) => [relative, Buffer.from(content)])
  ])
}

// ═══════════════════════════════════════════════════════════════════════════
// Queries: categorías, cobertura, suplementos y verificación
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Categorías de query que el IDE consume HOY.
 *
 * Es una copia DELIBERADA de `APPLIED_CATEGORIES`
 * (`src/main/extensions/treeSitter/tokenizer.ts`): "instalé las 8 categorías" y
 * "el IDE usa 6" no son lo mismo, y el reporte tiene que poder decirlo. Va en
 * espejo: `indents` ya lo consume el auto-indent del motor, así que está acá;
 * `rainbows` todavía no tiene consumidor (el color de brackets no existe) y el
 * reporte lo marca como tal en vez de dejar creer que funciona.
 */
export const CONSUMED_CATEGORIES = [
  'highlights',
  'tags',
  'folds',
  'injections',
  'locals',
  'textobjects',
  'indents'
]

/**
 * Categorías que se intentan completar con un suplemento cuando el repo del
 * parser no las publica.
 *
 * Los repos de los parsers publican poco (casi siempre `highlights` y `tags`);
 * el resto se trae de los catálogos. `rainbows` se instala aunque todavía no
 * tenga consumidor: es dato que viaja en el pack y el día que exista el color
 * de brackets no hay que regenerar nada.
 */
export const SUPPLEMENT_CATEGORIES = [...CONSUMED_CATEGORIES, 'rainbows']

/** Orden del reporte (el de arriba es el del pipeline de color→datos del árbol). */
export const CATEGORY_ORDER = ['highlights', 'injections', 'locals', 'tags', 'folds', 'indents', 'textobjects', 'rainbows']

/**
 * De dónde sale una query que el repo del parser NO publica.
 *
 * Los repos de los parsers publican poco (medido: 1–3 `.scm`, casi siempre
 * `highlights` + `tags`); el resto vive en catálogos de la comunidad. Se usan
 * TRES, cada uno fijado a un COMMIT (no a una rama) para que la instalación sea
 * reproducible: misma query hoy y en seis meses.
 *
 *   nvim-treesitter     Apache-2.0   highlights/injections/locals/folds/indents
 *   helix               MPL-2.0      tags/rainbows (y respaldo del resto)
 *   nvim-…-textobjects  Apache-2.0   textobjects
 *
 * Por qué así (medido sobre nuestros 36 lenguajes):
 *   - nvim gana en highlights (5437 vs 4651 líneas; más líneas en 23 lenguajes
 *     vs 11), injections (14 vs 7), locals (897 vs 376 líneas; 15 vs 4) y folds
 *     (33 vs 5 lenguajes); y su `indents` usa el vocabulario `@indent.begin/
 *     .end/.dedent` que YA consume el motor (Helix usa `@indent`/`@outdent`).
 *   - Helix es el ÚNICO con `tags` (nvim no tiene) y `rainbows`.
 *   - `textobjects` sale del repo dedicado de nvim porque usa `.inner/.outer`,
 *     que es justo lo que espera el consumidor; Helix usa `.inside/.around`.
 *
 * Licencia: Apache-2.0 (nvim y nvim-textobjects) y MPL-2.0 (Helix). La
 * procedencia (proyecto + commit + licencia) queda grabada en el `grammar.json`
 * del paquete, así que la atribución viaja con el `.sef` si se redistribuye.
 */
export const SUPPLEMENTS = {
  nvim: {
    id: 'nvim-treesitter',
    project: 'nvim-treesitter/nvim-treesitter',
    ref: '9a168f6357ed21c3a636e1727bc7d382abc451b8',
    license: 'Apache-2.0',
    /**
     * La ruta del catálogo cambió en 2025 (`queries/<lang>/` →
     * `runtime/queries/<lang>/`, verificado contra el commit de arriba). Se
     * prueban las dos: un `--supplement-ref` de una rama vieja sigue sirviendo.
     */
    paths: ['runtime/queries/{name}/{category}.scm', 'queries/{name}/{category}.scm']
  },
  helix: {
    id: 'helix',
    project: 'helix-editor/helix',
    ref: '079a789e8cb08ead67f19e1971a1b7438b37354b',
    license: 'MPL-2.0',
    paths: ['runtime/queries/{name}/{category}.scm'],
    /** Helix cubre terraform con las queries de `hcl`. */
    aliases: { terraform: 'hcl' }
  },
  textobjects: {
    id: 'nvim-treesitter-textobjects',
    project: 'nvim-treesitter/nvim-treesitter-textobjects',
    ref: '5c7b0263797dfd1bd6202f2b219f3b53a80b2187',
    license: 'Apache-2.0',
    paths: ['queries/{name}/{category}.scm']
  }
}

/**
 * EL REPARTO HÍBRIDO: qué catálogo se intenta primero para cada categoría.
 *
 * Reemplaza al "un solo catálogo para todo". El orden es de preferencia: si el
 * primero no publica esa categoría para el lenguaje, se prueba el siguiente.
 * Con `--supplement <id>` se fuerza uno solo (comportamiento viejo).
 *
 * `textobjects` usa Helix de respaldo aunque escriba `@function.inside/.around`:
 * el IDE normaliza los dos vocabularios (`.inside`→`.inner`, `.around`→`.outer`
 * en `buildTextObjects`), así que sirve igual.
 */
export const HYBRID_CATEGORY_SOURCES = {
  highlights: ['nvim', 'helix'],
  injections: ['nvim', 'helix'],
  locals: ['nvim', 'helix'],
  folds: ['nvim', 'helix'],
  indents: ['nvim', 'helix'],
  tags: ['helix'],
  textobjects: ['textobjects', 'helix'],
  rainbows: ['helix']
}

/**
 * Nombres con los que un suplemento puede conocer al lenguaje.
 *
 * El id nuestro sale del símbolo del parser (`tree_sitter_c_sharp` → `c_sharp`)
 * y cada catálogo usa su forma de carpeta: nvim `c_sharp`, Helix `c-sharp`. Se
 * prueban las dos formas (más la identidad) en vez de mantener una tabla de
 * alias, que se desincroniza.
 */
export function supplementNamesFor(language) {
  const id = String(language)
  return Array.from(new Set([id, id.replace(/-/g, '_'), id.replace(/_/g, '-')]))
}

/** URLs candidatas de una query de suplemento (en orden de preferencia). */
export function supplementUrls(source, { name, category, ref = source.ref }) {
  return source.paths.map(
    (template) =>
      `https://raw.githubusercontent.com/${source.project}/${ref}/${template
        .replace('{name}', name)
        .replace('{category}', category)}`
  )
}

/** Archivos de query con su categoría, sin descartar ninguno. */
export function categorizeFiles(files) {
  return files.map((file) => ({ ...file, category: categorizeQueryFile(file.relative) }))
}

/**
 * Plan de queries: qué archivo gana cada categoría y de dónde salió.
 *
 * Precedencia por categoría:
 *
 *   1. ajuste propio (`deps/queries-overrides/<símbolo>/<categoría>.scm`) — es
 *      NUESTRO y existe justamente para pisar lo del upstream (el motor lo trata
 *      igual: `applyQueryOverrides` copia encima);
 *   2. repo del parser (upstream);
 *   3. suplemento (nvim-treesitter, fijado por commit).
 *
 * Los archivos del upstream que no caen en ninguna categoría conocida entran
 * igual (el IDE decide dónde pintarlos) y el reporte marca que hoy no los lee
 * nadie.
 *
 * Es PURA: los suplementos entran como texto ya bajado. Así se testea sin red.
 */
export function planQueries({ files, overrides = [], supplements = [], categories = SUPPLEMENT_CATEGORIES }) {
  const upstream = categorizeFiles(files)
  const overridden = new Set(overrides.map((entry) => entry.category))

  const entries = upstream
    .filter((file) => !overridden.has(file.category))
    .map((file) => ({
      relative: file.relative,
      category: file.category,
      content: file.content ?? null,
      source: 'upstream',
      origin: 'repo del parser'
    }))

  for (const override of overrides) {
    entries.push({
      relative: `queries/${override.category}.scm`,
      category: override.category,
      content: override.content,
      source: 'override',
      // Un ajuste propio puede ser NUESTRO (sin origen de catálogo → "ajuste
      // propio") o un suplemento ya cacheado, que trae su procedencia al lado
      // (ver provenance.json): así el reporte y el `grammar.json` conservan la
      // atribución y la licencia.
      origin: override.origin ?? override.path,
      ...(override.ref ? { ref: override.ref } : {}),
      ...(override.license ? { license: override.license } : {})
    })
  }

  const missing = []
  for (const category of categories) {
    if (entries.some((entry) => entry.category === category)) continue
    const supplement = supplements.find((item) => item.category === category)
    if (!supplement) {
      missing.push(category)
      continue
    }
    entries.push({
      relative: `queries/${category}.scm`,
      category,
      content: supplement.content,
      source: 'supplement',
      origin: supplement.origin,
      ref: supplement.ref,
      license: supplement.license
    })
  }

  const order = (category) => {
    const index = CATEGORY_ORDER.indexOf(category)
    return index === -1 ? CATEGORY_ORDER.length : index
  }
  entries.sort((a, b) => order(a.category) - order(b.category) || a.relative.localeCompare(b.relative))

  const unconsumed = [...new Set(entries.map((entry) => entry.category))].filter(
    (category) => !CONSUMED_CATEGORIES.includes(category)
  )
  return { entries, missing, unconsumed }
}

/** Etiqueta de origen de una query (para el reporte y el `grammar.json`). */
export function originLabel(entry) {
  if (entry.source === 'upstream') return 'repo'
  // Ajuste propio sin catálogo detrás: es nuestro.
  if (entry.source === 'override' && !entry.ref) return 'ajuste propio'
  return entry.ref ? `${entry.origin}@${String(entry.ref).slice(0, 8)}` : String(entry.origin)
}

/**
 * Reporte de instalación: una línea por categoría, con su origen.
 *
 * Existe porque el fallo típico no era un error sino un silencio: el paquete se
 * instalaba sin `folds.scm` y el editor simplemente plegaba por sangría, sin que
 * nadie supiera por qué.
 */
export function renderQueryReport({ entries, missing }) {
  const counts = { upstream: 0, override: 0, supplement: 0 }
  for (const entry of entries) counts[entry.source] = (counts[entry.source] ?? 0) + 1
  const lines = [
    `queries: ${entries.length} archivo(s) ← ${counts.upstream} del repo, ${counts.override} ajuste(s) propio(s), ${counts.supplement} suplemento(s)`
  ]

  const byCategory = new Map()
  for (const entry of entries) {
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, [])
    byCategory.get(entry.category).push(entry)
  }
  const categories = [
    ...CATEGORY_ORDER.filter((category) => byCategory.has(category)),
    ...[...byCategory.keys()].filter((category) => !CATEGORY_ORDER.includes(category))
  ]
  for (const category of categories) {
    const list = byCategory.get(category)
    const note = CONSUMED_CATEGORIES.includes(category) ? '' : '  (sin consumidor todavía: se instala igual)'
    lines.push(`  ✓ ${category.padEnd(12)} ${list.map((entry) => `${entry.relative} ← ${originLabel(entry)}`).join(', ')}${note}`)
  }
  for (const category of missing) {
    lines.push(`  ✗ ${category.padEnd(12)} ni el repo ni el suplemento lo publican`)
  }
  return lines
}

/**
 * Qué tiene que APARECER en cada categoría para que la instalación sirva.
 *
 * Una query sin captures no falla al instalar: el archivo se abre sin ese dato y
 * nadie se entera. Esto lo convierte en un error explícito — es la diferencia
 * entre "dice que instaló folds" y "pliega por árbol".
 */
const CAPTURE_EXPECTATIONS = {
  highlights: /@[A-Za-z_]/, // cualquier capture pinta
  injections: /@injection|injection\.language/,
  locals: /@local[.\w]*/,
  tags: /@(definition|reference|name)[.\w]*/,
  folds: /@fold[.\w]*/,
  indents: /@indent[.\w]*/,
  // Cualquier `<algo>.inner`/`.outer` (function, class, comment, number…) más los
  // sinónimos de Helix `.inside`/`.around`, o el prefijo explícito
  // `textobject.<algo>.outer`: es lo que resuelve `buildTextObjects` en el IDE.
  textobjects: /@[A-Za-z_][\w.]*\.(inner|outer|inside|around)\b/,
  rainbows: /@rainbow[.\w]*/
}

/** Verifica que cada query produzca el dato que el IDE espera de su categoría. */
export function verifyQueries(entries) {
  return entries.map((entry) => {
    const content = entry.content ?? ''
    const captures = capturesOf(content)
    const expectation = CAPTURE_EXPECTATIONS[entry.category]
    const ok = captures.length > 0 && (!expectation || expectation.test(content))
    return {
      relative: entry.relative,
      category: entry.category,
      captures: captures.length,
      ok,
      detail:
        captures.length === 0
          ? 'sin captures'
          : ok
            ? `${captures.length} capture(s)`
            : 'no tiene los captures que el IDE espera'
    }
  })
}

/**
 * Carpetas y archivos que el build en C no usa y sólo engordan el checkout.
 *
 * Es una lista NEGRA a propósito (y no "copiar sólo `src/`"): varios monorepos
 * necesitan hermanos del parser que un whitelist rompería — `tree-sitter-typescript`
 * incluye `../../common/scanner.h` desde su scanner, así que `common/` tiene que
 * quedar.
 */
export const ENGINE_COPY_SKIP_DIRS = new Set([
  '.git',
  '.github',
  '.vscode',
  '.idea',
  'node_modules',
  'test',
  'tests',
  'examples',
  'example',
  'corpus',
  'bindings',
  'bindings2',
  'bench',
  'docs',
  'doc',
  'target',
  'build',
  '__pycache__'
])

/** Filtro de copia del repo al engine (para `fs.cpSync`). */
export function engineCopyFilter(root) {
  return (src) => {
    const relative = path.relative(root, src).replace(/\\/g, '/')
    if (relative === '') return true
    return !relative.split('/').some((part) => ENGINE_COPY_SKIP_DIRS.has(part))
  }
}

/**
 * Queries tal como las lista `deps/languages.json` (relativas a `queries/`).
 *
 * `languages.json` se usa para los recursos RCDATA de Windows y para el tooling
 * del engine: en Linux el staging copia TODO `.scm` que encuentre, pero en
 * Windows lo que no esté listado no entra al binario. Por eso un suplemento
 * también tiene que aparecer acá.
 */
export function engineQueryNames(entries) {
  return entries.map((entry) => entry.relative.replace(/^queries\//, ''))
}

/**
 * Dónde viven los ajustes propios (y los suplementos que bajamos).
 *
 * El engine ya tiene el suyo (`deps/queries-overrides/<símbolo>/`, con semántica
 * de "pisa o agrega"), así que si el checkout está, se usa ese: es la ÚNICA
 * fuente de verdad y la comparte el paquete SEF. Sin checkout, el CLI guarda lo
 * bajado bajo `dist/grammars/queries-overrides/` para no volver a bajar (y para
 * que la instalación sea reproducible sin red).
 */
export function defaultOverridesDir({ engineDir, projectRoot, symbol }) {
  if (engineDir && fs.existsSync(path.join(engineDir, 'deps', 'queries-overrides'))) {
    return path.join(engineDir, 'deps', 'queries-overrides', symbol)
  }
  return path.join(projectRoot, 'dist', 'grammars', 'queries-overrides', symbol)
}

/**
 * Procedencia de los suplementos CACHEADOS.
 *
 * Los catálogos se guardan como ajustes propios (`queries-overrides/<símbolo>/`)
 * para no volver a bajarlos. Sin este archivo, la corrida siguiente leería esos
 * `.scm` como "ajuste propio" a secas y la atribución (proyecto + commit +
 * licencia) se perdía: el `grammar.json` del pack salía SIN licencia, que es
 * justo lo que no puede pasar con contenido MPL-2.0. Se guarda al lado, por
 * categoría.
 */
const OVERRIDE_PROVENANCE_FILE = 'provenance.json'

function readOverrideProvenance(dir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, OVERRIDE_PROVENANCE_FILE), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeOverrideProvenance(dir, category, data) {
  const all = readOverrideProvenance(dir)
  all[category] = data
  fs.writeFileSync(path.join(dir, OVERRIDE_PROVENANCE_FILE), `${JSON.stringify(all, null, 2)}\n`)
}

/** Ajustes propios ya en disco (`<dir>/<categoría>.scm`, recursivo). */
function readOverrideFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return []
  const provenance = readOverrideProvenance(dir)
  const out = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.scm')) {
        const category = categorizeQueryFile(entry.name)
        out.push({
          path: full,
          category,
          content: fs.readFileSync(full, 'utf8'),
          ...(provenance[category] ?? {})
        })
      }
    }
  }
  walk(dir)
  return out
}

/**
 * Regenera los fragmentos del wasm y recompila el motor, en un solo paso.
 *
 * `tools/tui` publica su CLI de dos formas y no siempre están las dos: con
 * `ts-node` (dev) o con `dist/` ya compilado. Elegir mal da un "no such file" que
 * no dice nada, así que se elige la que exista y, si no hay ninguna, se explica
 * qué falta. `/build-wasm` es no interactivo a propósito (no abre prompts).
 *
 * Este paso es el único que NO se puede hacer en otra máquina sin el checkout del
 * engine + emscripten: el paquete SEF (destino `app`) existe justamente para eso.
 */
function runEngineWasmBuild(engineDir, log) {
  const tui = path.join(engineDir, 'tools', 'tui')
  const tsNode = path.join(tui, 'node_modules', '.bin', 'ts-node')
  const distEntry = path.join(tui, 'dist', 'index.js')
  if (fs.existsSync(tsNode)) {
    log('regenerando fuentes/queries del wasm (tools/tui vía ts-node)')
    run(tsNode, ['src/index.ts', '/build-wasm'], { cwd: tui })
  } else if (fs.existsSync(distEntry)) {
    log('regenerando fuentes/queries del wasm (tools/tui vía dist/)')
    run('node', [distEntry, '/build-wasm'], { cwd: tui })
  } else {
    throw new Error(
      `no encuentro el CLI del engine en ${tui} (ni node_modules/.bin/ts-node ni dist/index.js)\n` +
        '  → instalalo con `npm install` en tools/tui (o compilá con `npm run build` ahí)'
    )
  }
  const buildScript = path.join(engineDir, 'emscripten', 'build-wasm.sh')
  if (!fs.existsSync(buildScript)) throw new Error(`falta ${buildScript}`)
  log('compilando el wasm (emscripten) y copiándolo al renderer')
  run('bash', [buildScript], { cwd: engineDir })
}

/**
 * Baja una query del catálogo supplementary.
 *
 * Devuelve `null` cuando esa categoría no existe en el catálogo (pasa: no todos
 * los lenguajes tienen `folds` allí tampoco). No es un error: el reporte lo dirá
 * como "faltante" y el IDE cae a plegado por sangría.
 */
async function fetchSupplementQuery({ source, language, category, ref, log }) {
  const names = new Set(supplementNamesFor(language))
  const alias = source.aliases?.[String(language)]
  if (alias) names.add(alias)
  for (const name of names) {
    for (const url of supplementUrls(source, { name, category, ref })) {
      let response
      try {
        response = await fetch(url)
      } catch {
        continue
      }
      if (!response.ok) continue
      const content = await response.text()
      if (!content.trim()) continue
      log(`suplemento ${category} ← ${source.id}@${ref.slice(0, 8)} (${name})`)
      return { content, origin: source.id, ref, license: source.license, url }
    }
  }
  return null
}

/**
 * Baja una query del catálogo y la deja AUTOCONTENIDA.
 *
 * nvim-treesitter reparte una categoría entre varios carpetas y une con
 * `; inherits:` (medido: `javascript/{folds,indents}.scm` son sólo la directiva
 * hacia `ecma`/`jsx`, y `html/indents.scm` hacia `html_tags`). El motor NO
 * conoce esos nombres —son del catálogo, no lenguajes nuestros—, así que la
 * herencia se resuelve acá y se guarda el archivo ya fusionado. Guardar el stub
 * era instalar un folds.scm de 21 bytes que no pliega nada.
 */
async function fetchSupplementQueryWithInherits({ source, language, category, ref, log, seen = new Set(), depth = 0 }) {
  const fetched = await fetchSupplementQuery({ source, language, category, ref, log })
  if (!fetched) return null
  const bases = declaredInherits(fetched.content)
  if (bases.length === 0 || depth >= 4) return fetched

  let content = fetched.content
  const used = []
  for (const base of bases) {
    if (seen.has(base)) continue
    seen.add(base)
    const inherited = await fetchSupplementQueryWithInherits({
      source,
      language: base,
      category,
      ref,
      log: () => {},
      seen,
      depth: depth + 1
    })
    if (!inherited) continue
    content = mergeInheritedQueries(content, inherited.content)
    used.push(base)
  }
  if (used.length > 0) {
    log(`suplemento ${category}: "${language}" hereda de ${used.join(', ')} → fusionado`)
  }
  return { ...fetched, content }
}

/**
 * Baja al catálogo las bases de `; inherits:` que falten en disco.
 *
 * `resolveInheritChain`/`findBaseQuery` sólo miran el disco. Con el caché frío
 * (primera corrida en una máquina, o el caché borrado) un lenguaje que hereda
 * de otro que TODAVÍA no se procesó —`svelte` hereda de `html`, y `html` sólo
 * existe como suplemento— quedaba con el stub sin capturas y la verificación
 * fallaba: el resultado dependía del ORDEN de los lenguajes.
 *
 * Acá se completa el caché ANTES de resolver: la base se busca por categoría en
 * el mismo reparto híbrido, se guarda en `queries-overrides/<base>/` (que es
 * donde `findBaseQuery` la encuentra) y se recurre por si la base a su vez
 * hereda de otra (`html` → `html_tags`).
 */
async function seedInheritedBases({
  entries,
  engineDir,
  profileDir,
  overridesRoot,
  sourceIdsFor,
  ref,
  log,
  seen = new Set(),
  depth = 0
}) {
  if (depth > 4) return
  for (const entry of entries) {
    const category = entry.category
    if (!category) continue
    for (const base of declaredInherits(entry.content ?? '')) {
      const key = `${base}/${category}`
      if (seen.has(key)) continue
      seen.add(key)
      const relative = entry.relative ?? `queries/${category}.scm`
      if (baseQueryPath({ base, relative, engineDir, profileDir, overridesRoot })) continue

      let fetched = null
      for (const sourceId of sourceIdsFor(category)) {
        const source = SUPPLEMENTS[sourceId]
        if (!source) continue
        fetched = await fetchSupplementQuery({
          source,
          language: base,
          category,
          ref: ref ?? source.ref,
          log: () => {}
        })
        if (fetched) break
      }
      if (!fetched) {
        log(`aviso: no pude bajar la base "${base}" (${category}) para fusionar`)
        continue
      }
      const dir = path.join(overridesRoot, base)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${category}.scm`), fetched.content)
      // La base puede llamarse igual que un lenguaje que SÍ empaquetamos
      // (`html` es base de `svelte` y lenguaje propio): si se guardara sin
      // procedencia, ese lenguaje perdería la licencia al leer su carpeta.
      writeOverrideProvenance(dir, category, {
        origin: fetched.origin,
        ref: fetched.ref,
        license: fetched.license
      })
      log(`base ${base}/${category}.scm ← ${fetched.origin} (para fusionar)`)
      await seedInheritedBases({
        entries: [{ relative: `queries/${category}.scm`, category, content: fetched.content }],
        engineDir,
        profileDir,
        overridesRoot,
        sourceIdsFor,
        ref,
        log,
        seen,
        depth: depth + 1
      })
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

const HELP = `
grammar.mjs — traer una gramática tree-sitter desde un link y dejarla andando.

  node tools/grammar.mjs <link> [opciones]

Link:
  https://github.com/<owner>/<repo>[#tag]     repo del parser (git)
  https://github.com/<owner>/<repo>/tree/<ref>/<subruta>
  <paquete-npm>[@version]                     parser publicado en npm
  https://…/parser.wasm | ./parser.wasm       wasm ya compilado
  ./ruta/a/un/checkout                        copia local

Opciones:
  --parser <nombre>     subparser de un monorepo (typescript, tsx, markdown…)
  --name <id>           id del lenguaje (default: el símbolo del parser)
  --ext <ext,ext>       extensiones de archivo (default: las del repo o de una
                        extensión de lenguaje instalada; si no hay, hay que pasarlas)
  --inherits <langs>    lenguajes base a fusionar en las queries (javascript)
  --target app|engine|both|langs
                        a dónde va (default: app)
                          app    → paquete SEF (.sef) instalable
                          engine → fuentes al motor + rebuild (--build)
                          langs  → carpeta desempaquetada por lenguaje
                                   (<out>/<id>/) + índice <out>/index.json
                                   para que el IDE la lea on-demand
                                   (SIN recompilar el motor)
  --install             instala el paquete en la app (userData/extensions)
  --queries <dir>       DIRECTORIO de queries cuando el link es un .wasm suelto
                        (las categorías se piden con --categories)
  --categories <all|minimal|highlights,folds,…>
                        qué completar con suplementos cuando el repo no lo
                        publica (default: all = highlights, injections, locals,
                        tags, folds, indents, textobjects, rainbows)
  --supplement hybrid|nvim|helix|textobjects|none
                        catálogo supplementary (default: hybrid)
                          hybrid → elige por categoría: nvim para highlights/
                            injections/locals/folds/indents, helix para tags/
                            rainbows, nvim-treesitter-textobjects para
                            textobjects (con Helix de respaldo cuando falta)
                          <id>   → forzar un solo catálogo
  --supplement-ref <ref>     otro commit/rama del catálogo (sólo con --supplement <id>)
  --overrides <dir>     ajustes propios; default: deps/queries-overrides/<símbolo>
                        del engine si el checkout está, si no dist/grammars/…
  --verify              verificar los captures de cada categoría (0 = fallo)
  --id <package-id>     id del paquete SEF (default: scrakk.grammar.<name>)
  --out <dir>           dónde dejar el .sef (default: dist/grammars)
  --profile <dir>       dir de extensiones de la app (default: según el SO)
  --engine-dir <dir>    checkout del engine (default: ${DEFAULT_ENGINE_DIR})
  --runtime <dir>       runtime de tree-sitter (el checkout del engine sirve)
  --wasm <archivo>      usar este .wasm en vez de compilar
  --force               empaquetar aunque la ABI no sea la que acepta el cargador
  --build               en --target engine, correr también el build del wasm
  --dry-run             decir qué haría, sin escribir nada
  --keep                no borrar el temporal (depuración)
  -h, --help            esta ayuda
`

function parseArgs(argv) {
  const options = { target: 'app', flags: new Set(), list: {} }
  const valueFlags = new Set([
    'parser', 'name', 'ext', 'inherits', 'target', 'queries', 'id', 'out', 'profile',
    'engine-dir', 'runtime', 'wasm', 'categories', 'supplement', 'supplement-ref', 'overrides'
  ])
  const boolFlags = new Set(['install', 'dry-run', 'keep', 'help', 'build', 'force', 'verify'])
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--') && arg !== '-h') {
      if (!options.link) options.link = arg
      else throw new Error(`sobra un argumento: ${arg}`)
      continue
    }
    const key = arg === '-h' ? 'help' : arg.slice(2)
    if (valueFlags.has(key)) {
      const value = argv[++i]
      if (value === undefined) throw new Error(`--${key} necesita un valor`)
      options.list[key] = value
      if (key === 'target') options.target = value
    } else if (boolFlags.has(key)) {
      options.flags.add(key)
    } else {
      throw new Error(`opción desconocida: ${arg}`)
    }
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const lines = []
  const log = (message) => {
    lines.push(message)
    console.log(`  ${message}`)
  }

  if (options.flags.has('help') || !options.link) {
    console.log(HELP.trim())
    return options.link ? 0 : 2
  }

  const engineDir = path.resolve(options.list['engine-dir'] ?? DEFAULT_ENGINE_DIR)
  const profileDir = options.list.profile
    ? path.resolve(options.list.profile)
    : profileExtensionsDir(process.platform, process.env)
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'scrakk-grammar-'))
  const cleanups = []

  try {
    const link = parseLink(options.link)
    console.log(`\n▸ ${options.link}  →  ${link.kind}${link.ref ? `#${link.ref}` : ''}\n`)

    let parserCandidate = null
    let root = null
    let source = null
    let queryList = []
    let wasmPath = options.list.wasm ? path.resolve(options.list.wasm) : null
    let language = options.list.name ?? null
    let metadata = { extensions: [], aliases: [], version: '1.0.0' }
    let abi = null

    if (link.kind === 'wasm' && !options.list.queries) {
      // Sólo un .wasm: se puede empaquetar, pero sin queries no hay color. Se
      // avisa y se sigue (un manifest válido sin queries es mejor que nada).
      const fetched = await fetchWasm(link, scratch, log)
      cleanups.push(fetched.cleanup)
      wasmPath = wasmPath ?? fetched.wasm
      source = fetched.source
      log('aviso: el link es un .wasm suelto y sin --queries el paquete no pinta (queda declarado igual)')
    } else if (link.kind === 'wasm') {
      const fetched = await fetchWasm(link, scratch, log)
      cleanups.push(fetched.cleanup)
      wasmPath = wasmPath ?? fetched.wasm
      source = fetched.source
      root = path.resolve(options.list.queries)
      if (!fs.existsSync(root)) throw new Error(`--queries ${root} no existe`)
      queryList = queryFiles(root, 'src')
    } else {
      const fetched = await fetchSource(link, scratch, log)
      cleanups.push(fetched.cleanup)
      root = fetched.dir
      source = fetched.source
      const candidates = parserCandidates(root)
      parserCandidate = selectParser(candidates, options.list.parser)
      language = language ?? languageFromSymbol(parserCandidate.symbol)
      metadata = languageMetadata(root, parserCandidate.symbol)
      const parserC = fs.readFileSync(path.join(parserCandidate.dir, 'parser.c'), 'utf8')
      abi = abiFromParserC(parserC)
      queryList = queryFiles(root, parserCandidate.relative)
      log(`lenguaje: ${language} (símbolo tree_sitter_${parserCandidate.symbol}, ABI ${abi ?? '?'})`)
      log(`queries del repo: ${queryList.length === 0 ? 'NINGUNA' : queryList.map((q) => q.relative).join(', ')}`)
    }

    if (!language) throw new Error('no pude deducir el nombre del lenguaje: pasalo con --name')

    // ── Queries: qué se instala, de dónde sale y qué falta ─────────────────
    //
    // El repo del parser publica lo que quiere (medido sobre los 18 lenguajes
    // del motor: 0 traen `folds.scm`). Acá se decide el set final —upstream +
    // ajustes propios + suplemento fijado— y se reporta, para que un "no plegó"
    // no sea un misterio.
    const symbol = parserCandidate?.symbol ?? language
    const overridesDir = options.list.overrides
      ? path.resolve(options.list.overrides)
      : defaultOverridesDir({ engineDir, projectRoot: PROJECT_ROOT, symbol })
    const overrides = readOverrideFiles(overridesDir)
    if (overrides.length > 0) {
      log(`ajustes propios: ${overrides.map((entry) => path.basename(entry.path)).join(', ')} (${overridesDir})`)
    }

    let categories = SUPPLEMENT_CATEGORIES
    const categoriesFlag = options.list.categories ?? 'all'
    if (categoriesFlag === 'minimal') {
      categories = ['highlights']
    } else if (categoriesFlag !== 'all') {
      categories = categoriesFlag.split(/[\s,]+/).filter(Boolean)
      if (categories.length === 0) throw new Error(`--categories "${categoriesFlag}" no dice nada`)
    }

    const supplements = []
    const supplementFlag = options.list.supplement ?? 'hybrid'
    if (supplementFlag !== 'none') {
      const forcedSource = supplementFlag === 'hybrid' ? null : SUPPLEMENTS[supplementFlag]
      if (supplementFlag !== 'hybrid' && !forcedSource) {
        throw new Error(
          `--supplement "${supplementFlag}" no existe (hay: hybrid, none, ${Object.keys(SUPPLEMENTS).join(', ')})`
        )
      }
      if (!forcedSource && options.list['supplement-ref']) {
        log('aviso: --supplement-ref se ignora en modo híbrido; se usa el commit fijado de cada catálogo')
      }
      for (const category of categories) {
        const haveIt =
          overrides.some((entry) => entry.category === category) ||
          queryList.some((query) => categorizeQueryFile(query.relative) === category)
        if (haveIt) continue
        // Híbrido: se prueban los catálogos de esa categoría EN ORDEN y gana el
        // primero que la publique. Forzado: uno solo (comportamiento viejo).
        const sourceIds = forcedSource
          ? [supplementFlag]
          : HYBRID_CATEGORY_SOURCES[category] ?? Object.keys(SUPPLEMENTS)
        const ref = forcedSource ? options.list['supplement-ref'] ?? forcedSource.ref : null
        let fetched = null
        for (const sourceId of sourceIds) {
          const source = SUPPLEMENTS[sourceId]
          if (!source) continue
          fetched = await fetchSupplementQueryWithInherits({
            source,
            language,
            category,
            ref: ref ?? source.ref,
            log
          })
          if (fetched) break
        }
        if (!fetched) continue
        supplements.push({ category, ...fetched })
        // Se guarda en los ajustes propios: la próxima vez no hay red de por
        // medio, la instalación es reproducible, y el MISMO archivo es el que
        // usa el engine (una sola fuente de verdad).
        if (!options.flags.has('dry-run')) {
          const dest = path.join(overridesDir, `${category}.scm`)
          fs.mkdirSync(overridesDir, { recursive: true })
          fs.writeFileSync(dest, fetched.content)
          // La procedencia viaja con el archivo cacheado: sin esto, la próxima
          // corrida lo leería como "ajuste propio" y el pack saldría sin
          // licencia.
          writeOverrideProvenance(overridesDir, category, {
            origin: fetched.origin,
            ref: fetched.ref,
            license: fetched.license
          })
          log(`guardado en ${dest}`)
        }
      }
    }

    const upstreamFiles = queryList.map((query) => ({ ...query, content: fs.readFileSync(query.absolute, 'utf8') }))
    const plan = planQueries({ files: upstreamFiles, overrides, supplements, categories })
    for (const line of renderQueryReport(plan)) log(line)

    // ── Bases de herencia: completar el caché ANTES de resolver ────────────
    // Si no, un lenguaje podía fallar por el ORDEN en que se procesan (su base
    // todavía no estaba bajada). Ver `seedInheritedBases`.
    const overridesRoot = path.dirname(overridesDir)
    if (supplementFlag !== 'none') {
      await seedInheritedBases({
        entries: plan.entries,
        engineDir,
        profileDir,
        overridesRoot,
        sourceIdsFor: (category) =>
          supplementFlag === 'hybrid'
            ? HYBRID_CATEGORY_SOURCES[category] ?? Object.keys(SUPPLEMENTS)
            : [supplementFlag],
        ref:
          supplementFlag === 'hybrid'
            ? null
            : options.list['supplement-ref'] ?? SUPPLEMENTS[supplementFlag]?.ref ?? null,
        log
      })
    }

    // ── Herencia de queries (base primero) ─────────────────────────────────
    const inheritsFlag = options.list.inherits
      ? options.list.inherits.split(/[\s,]+/).filter(Boolean)
      : []
    const queryContents = {}
    for (const query of plan.entries) {
      const forced = inheritsFlag.length > 0 ? inheritsFlag : null
      if (forced) {
        let content = query.content
        for (const base of forced) {
          const baseContent = findBaseQuery({ base, relative: query.relative, engineDir, profileDir, overridesRoot, log })
          if (!baseContent) continue
          content = mergeInheritedQueries(content, baseContent)
          log(`query ${query.relative}: fusionada con la base "${base}"`)
        }
        query.content = content
        queryContents[query.relative] = content
        continue
      }
      const declared = declaredInherits(query.content)
      if (declared.length === 0) {
        queryContents[query.relative] = query.content
        continue
      }
      // La cadena completa se resuelve acá para que el archivo instalado sea
      // autocontenido (el motor resuelve `inherits:` por su cuenta, pero el
      // paquete SEF viaja a máquinas donde la base puede no estar).
      query.content = resolveInheritChain(query.content, (base) =>
        findBaseQuery({ base, relative: query.relative, engineDir, profileDir, overridesRoot, log })
      )
      log(`query ${query.relative}: herencia resuelta (${declared.join(' → ')})`)
      queryContents[query.relative] = query.content
    }

    // ── Verificación: una categoría sin captures es una instalación rota ───
    const verification = verifyQueries(plan.entries)
    const broken = verification.filter((row) => !row.ok)
    if (options.flags.has('verify')) {
      for (const row of verification) {
        log(`  ${row.ok ? '✓' : '✗'} ${row.category.padEnd(12)} ${row.relative} (${row.detail})`)
      }
    }
    if (broken.length > 0) {
      const detail = broken.map((row) => `  ${row.category}: ${row.relative} (${row.detail})`).join('\n')
      const message = `estas queries no producen el dato que el IDE espera de su categoría:\n${detail}`
      if (!options.flags.has('force')) {
        throw new Error(`${message}\n  → revisá el archivo, o pasá --force si sabés lo que hacés`)
      }
      log(`aviso: ${message}`)
    }

    // ── ABI: el cargador rechaza un parser de otra generación ───────────────
    const runtime = runtimeCandidates(engineDir, options.list.runtime).filter((dir) => fs.existsSync(dir))
    const headers = findRuntimeHeaders(runtime)
    const apiHeader = headers
      ? [path.join(headers.includeDir, 'tree_sitter', 'api.h'), path.join(headers.includeDir, 'api.h')].find((f) =>
          fs.existsSync(f)
        )
      : null
    const runtimeAbi = apiHeader ? readRuntimeAbi(apiHeader) : null
    if (abi && runtimeAbi?.min != null && runtimeAbi.max != null && (abi < runtimeAbi.min || abi > runtimeAbi.max)) {
      const message =
        `el parser declara ABI ${abi} y el runtime acepta ${runtimeAbi.min}–${runtimeAbi.max}: el cargador lo RECHAZARÍA ` +
        '(Incompatible language version). Regenerá el parser con `tree-sitter generate` (o usá un repo/tag más nuevo).'
      if (!options.flags.has('force')) throw new Error(message)
      log(`aviso: ${message}`)
    }

    // ── Compilar (si hace falta) ───────────────────────────────────────────
    if (!wasmPath) {
      if (!headers) {
        throw new Error(
          `falta el runtime de tree-sitter (tree_sitter/parser.h). Busqué en: ${runtime.join(', ') || '(nada)'}\n` +
            '  → pasá --runtime <dir> con un checkout de tree-sitter, o --wasm <archivo> si ya lo tenés compilado'
        )
      }
      // El header del runtime no siempre está en la ruta que espera el `#include`
      // del parser (`<dir>/parser.h` vs `<dir>/tree_sitter/parser.h`): se le arma
      // esa forma en un directorio temporal en vez de sumar rutas adivinadas.
      const shim = path.join(scratch, 'runtime-include')
      fs.mkdirSync(path.join(shim, 'tree_sitter'), { recursive: true })
      fs.copyFileSync(headers.parserHeader, path.join(shim, 'tree_sitter', 'parser.h'))
      if (apiHeader) fs.copyFileSync(apiHeader, path.join(shim, 'tree_sitter', 'api.h'))
      const emcc = resolveEmcc(log)
      const wasmOut = path.join(scratch, `${language}.wasm`)
      buildParserWasm({ parserCandidate, includeDirs: [shim, ...runtime], out: wasmOut, emcc, log })
      wasmPath = wasmOut
    }

    // ── Extensiones de archivo: sin esto el paquete se instala y NO se asocia a
    // ningún archivo (el usuario abre su `.ex` y sigue sin lenguaje). No se
    // inventa un mapa: se falla con la bandera exacta que lo arregla.
    let extensions = options.list.ext ? options.list.ext.split(',') : metadata.extensions
    if (extensions.length === 0) {
      extensions = extensionsFromInstalledPackages(profileDir, language)
    }
    if (extensions.length === 0 && !options.flags.has('force')) {
      throw new Error(
        `no pude deducir las extensiones de archivo de "${language}": el paquete del parser no las declara ` +
          '(ni `tree-sitter.json` ni `package.json > tree-sitter`) y no hay una extensión de lenguaje ' +
          `instalada para "${language}".\n  → pasá --ext ex,exs (o --force si querés el paquete sin asociar)`
      )
    }

    const sha256 = createHash('sha256').update(fs.readFileSync(wasmPath)).digest('hex')
    const packageId = options.list.id ?? `scrakk.grammar.${language}`
    const manifest = buildManifest({
      language,
      aliases: metadata.aliases,
      extensions,
      version: metadata.version,
      queries: plan.entries,
      abi,
      sha256,
      packageId,
      source
    })

    if (options.flags.has('dry-run')) {
      console.log('\n(dry-run) manifest que se escribiría:\n')
      console.log(JSON.stringify(manifest, null, 2))
      return 0
    }

    // ── Empaquetar e instalar (destino app) ────────────────────────────────
    const { zipSync } = await import('fflate')
    const files = packageFiles({
      manifest,
      wasm: wasmPath,
      queryContents,
      provenance: {
        language,
        symbol: parserCandidate?.symbol ?? null,
        source,
        abi,
        builtAt: new Date().toISOString(),
        generatedBy: 'tools/grammar.mjs',
        // Procedencia POR QUERY: qué archivo ganó cada categoría y de dónde
        // salió. Es lo que permite auditar después por qué un lenguaje pinta o
        // pliega como pinta (y la atribución del suplemento, que es Apache-2.0).
        queries: plan.entries.map((entry) => ({
          file: entry.relative,
          category: entry.category,
          source: entry.source,
          origin: originLabel(entry),
          ...(entry.ref ? { ref: entry.ref } : {}),
          ...(entry.license ? { license: entry.license } : {}),
          ...(entry.content ? { sha256: createHash('sha256').update(entry.content).digest('hex') } : {})
        })),
        // Lo que el repo y el catálogo no publican: el IDE cae a su alternativa
        // (plegado por sangría) y esto deja constancia de que fue a propósito.
        missingCategories: plan.missing,
        categoriesWithoutConsumer: plan.unconsumed,
        inherits: inheritsFlag
      }
    })
    const zipInput = {}
    for (const [name, data] of files) zipInput[name] = new Uint8Array(data)
    const zipped = zipSync(zipInput)

    if (options.target !== 'langs') {
      const outDir = path.resolve(options.list.out ?? path.join(PROJECT_ROOT, 'dist', 'grammars'))
      fs.mkdirSync(outDir, { recursive: true })
      const sefPath = path.join(outDir, `${packageId.replace(/\./g, '-')}.sef`)
      fs.writeFileSync(sefPath, zipped)
      log(`paquete: ${sefPath} (${zipped.length} bytes, sha256 del parser ${sha256.slice(0, 12)}…)`)
    }

    // ── Destino `langs`: carpeta desempaquetada por lenguaje ───────────────
    //
    // Cada lenguaje queda como `<out>/<id>/` (manifest + grammars/<id>.wasm +
    // queries/*.scm) y un `<out>/index.json` con la lista. El IDE los lee
    // on-demand: actualizar un lenguaje = regenerar SU carpeta, sin recompilar
    // el motor.
    if (options.target === 'langs') {
      const langsDir = path.resolve(options.list.out ?? path.join(PROJECT_ROOT, 'langs'))
      const pkgDir = path.join(langsDir, language)
      fs.rmSync(pkgDir, { recursive: true, force: true })
      for (const [name, data] of files) {
        const dest = path.join(pkgDir, name)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, data)
      }

      const indexFile = path.join(langsDir, 'index.json')
      let index = { version: 1, languages: [] }
      try {
        index = JSON.parse(fs.readFileSync(indexFile, 'utf8'))
      } catch {
        // Sin índice previo (o corrupto): se arranca uno nuevo.
      }
      const langs = Array.isArray(index.languages) ? index.languages : []
      const langDecl = manifest.contributes.languages[0]
      const grammar = langDecl.grammars[0]
      const entry = {
        id: language,
        name: langDecl.aliases?.[0] ?? language,
        aliases: langDecl.aliases ?? [language],
        extensions: langDecl.extensions ?? [],
        parser: grammar.parser,
        queries: grammar.queries,
        abi: grammar.abi,
        sha256: grammar.sha256
      }
      const at = langs.findIndex((l) => l.id === language)
      if (at >= 0) langs[at] = entry
      else langs.push(entry)
      langs.sort((a, b) => a.id.localeCompare(b.id))
      fs.writeFileSync(indexFile, `${JSON.stringify({ ...index, version: 1, languages: langs }, null, 2)}\n`)

      // Manifiesto de PACK: `langs/` es UNA extensión con N lenguajes, así el
      // IDE la registra por el camino normal (`contributes.languages`) sin
      // tocar el motor. Rutas relativas al directorio del pack.
      const packFile = path.join(langsDir, 'manifest.json')
      let pack = {
        id: 'scrakk.langs',
        name: 'Lenguajes (tree-sitter)',
        version: '1.0.0',
        author: 'scrakk-grammar',
        description: 'Gramáticas tree-sitter, una por lenguaje, cargadas on-demand.',
        contributes: { languages: [] }
      }
      try {
        pack = JSON.parse(fs.readFileSync(packFile, 'utf8'))
      } catch {
        // Sin manifiesto previo: se arranca uno nuevo.
      }
      const declaration = {
        id: language,
        aliases: langDecl.aliases?.length ? langDecl.aliases : [language],
        extensions: langDecl.extensions ?? [],
        grammars: [
          {
            kind: 'treeSitter',
            parser: `${language}/grammars/${language}.wasm`,
            queries: (grammar.queries ?? []).map((q) => `${language}/${q}`),
            ...(grammar.abi ? { abi: grammar.abi } : {}),
            ...(grammar.sha256 ? { sha256: grammar.sha256 } : {})
          }
        ]
      }
      const declared = Array.isArray(pack.contributes?.languages) ? pack.contributes.languages : []
      const declaredAt = declared.findIndex((l) => l.id === language)
      if (declaredAt >= 0) declared[declaredAt] = declaration
      else declared.push(declaration)
      declared.sort((a, b) => a.id.localeCompare(b.id))
      pack.contributes = { ...(pack.contributes ?? {}), languages: declared }
      fs.writeFileSync(packFile, `${JSON.stringify(pack, null, 2)}\n`)

      log(`lenguaje → ${pkgDir} (${langs.length} en el índice)`)
    }

    if (options.target === 'app' || options.target === 'both') {
      if (options.flags.has('install')) {
        const target = path.join(profileDir, packageId)
        fs.rmSync(target, { recursive: true, force: true })
        for (const [name, data] of files) {
          const dest = path.join(target, name)
          fs.mkdirSync(path.dirname(dest), { recursive: true })
          fs.writeFileSync(dest, data)
        }
        log(`instalado en ${target} — abrí la app (o recargá) para que el lenguaje tome`)
      } else {
        log(`para instalarlo: copiar a ${path.join(profileDir, packageId)} (o correr con --install)`)
      }
    }

    // ── Embeber en el engine ───────────────────────────────────────────────
    if (options.target === 'engine' || options.target === 'both') {
      if (!fs.existsSync(path.join(engineDir, 'deps', 'languages.json'))) {
        throw new Error(`${engineDir} no parece el checkout del engine (falta deps/languages.json)`)
      }
      if (link.kind !== 'dir' && link.kind !== 'git' && link.kind !== 'npm') {
        throw new Error('--target engine necesita las fuentes de la gramática (no un .wasm suelto)')
      }
      const repoName = repoNameFor(language, link)
      const destination = path.join(engineDir, 'deps', 'languages', repoName)
      // Si el link ES el checkout del engine (`--parser` de un lenguaje que ya
      // está), copiar sería borrar la fuente antes de leerla.
      if (path.resolve(root) === path.resolve(destination)) {
        log(`las fuentes ya están en ${destination}: no se copia nada`)
      } else {
        fs.rmSync(destination, { recursive: true, force: true })
        // El engine compila `src/` y embebe `queries/`; el resto (bindings,
        // tests, CI, corpus) sólo engorda el checkout. Lista negra y no "sólo
        // src/" porque hay monorepos que incluyen hermanos del parser (el
        // scanner de tree-sitter-typescript hace `#include "../../common/scanner.h"`).
        fs.cpSync(root, destination, { recursive: true, filter: engineCopyFilter(root) })
      }

      // Los suplementos tienen que estar donde el engine los busca: su staging
      // copia las queries del repo y DESPUÉS pisa con
      // `deps/queries-overrides/<símbolo>/` (`applyQueryOverrides`).
      if (supplements.length > 0) {
        const engineOverrides = path.join(engineDir, 'deps', 'queries-overrides', symbol)
        fs.mkdirSync(engineOverrides, { recursive: true })
        for (const supplement of supplements) {
          fs.writeFileSync(path.join(engineOverrides, `${supplement.category}.scm`), supplement.content)
        }
        log(`suplementos en deps/queries-overrides/${symbol}: ${supplements.map((s) => s.category).join(', ')}`)
      }
      const registryPath = path.join(engineDir, 'deps', 'languages.json')
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
      const entry = engineRegistryEntry({
        language,
        repoName,
        repoUrl: link.kind === 'git' ? (link.url ?? '').replace(/\.git$/, '') : '',
        queries: plan.entries,
        hasScannerC: fs.existsSync(path.join(destination, parserCandidate.relative, 'scanner.c')),
        hasScannerCC: ['scanner.cc', 'scanner.cpp'].some((f) => fs.existsSync(path.join(destination, parserCandidate.relative, f)))
      })
      fs.writeFileSync(registryPath, `${JSON.stringify(upsertRegistry(registry, entry), null, 2)}\n`)
      log(`fuentes en ${destination} y registry actualizado (${entry.name})`)

      // La herencia va declarada para que el build la aplique al embeber.
      if (inheritsFlag.length > 0) {
        const overrideDir = path.join(engineDir, 'deps', 'queries-overrides', parserCandidate.symbol)
        fs.mkdirSync(overrideDir, { recursive: true })
        fs.writeFileSync(path.join(overrideDir, 'inherits'), `${inheritsFlag.join(' ')}\n`)
        log(`herencia declarada en deps/queries-overrides/${parserCandidate.symbol}/inherits`)
      }

      if (options.flags.has('build')) {
        runEngineWasmBuild(engineDir, log)
        log('engine reconstruido (wasm + copia a src/renderer/public/innerta/)')
      } else {
        log('para terminar el camino del engine: --build (regenera + recompila el wasm)')
      }
    }

    console.log('\n✓ listo')
    return 0
  } finally {
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup()
      } catch {
        /* temporales: da igual */
      }
    }
    if (!options.flags.has('keep')) fs.rmSync(scratch, { recursive: true, force: true })
    else console.log(`(temporal conservado: ${scratch})`)
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  main()
    .then((code) => {
      process.exitCode = code ?? 0
    })
    .catch((error) => {
      console.error(`\n✗ ${error.message}`)
      process.exitCode = 1
    })
}
