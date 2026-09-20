/**
 * Tipo `languages` — lógica.
 *
 * Tres cosas, en este orden de importancia:
 *
 * 1. **Asociación archivo → lenguaje**: es el disparador de todo lo demás
 *    (`onLanguage`). Sin esto no hay gramática, ni queries, ni LSP, ni
 *    configuración. Se resuelve por nombre exacto, glob, extensión (gana la
 *    extensión MÁS LARGA: `.d.ts` antes que `.ts`) y por primera línea.
 * 2. **Indexado de queries**: se leen TODAS las `.scm` declaradas y se
 *    categorizan (incluidas las que no conocemos, que caen en `unknown`). El
 *    índice incluye los captures de cada query, porque los captures son el
 *    `scope` que resuelve el color (ver `@shared/syntax`).
 * 3. **Configuración y snippets**: se parsean y se exponen; el editor los
 *    consume cuando los necesite (brackets, comentarios, plegado).
 *
 * Nada de aquí ejecuta un parser ni tokeniza: eso es del worker. Aquí se
 * DECLARA el lenguaje y se indexan sus datos.
 */

import {
  describeQueryCategory,
  listQueryFiles,
  capturesOf,
  injectionLanguagesOf,
  type QueryCategory,
  type SyntaxLayer
} from '@shared/syntax'
import type { GrammarContribution, SnippetContribution } from './schema'

// ── Queries indexadas ──────────────────────────────────────────────────────

/** Una query ya leída y clasificada, lista para que el IDE pinte su dato. */
export interface LanguageQueryData {
  file: string
  category: QueryCategory
  label: string
  layer: SyntaxLayer
  variant: string | null
  /** Scopes que puede producir (los `@capture` del archivo). */
  captures: string[]
  /**
   * Lenguajes que declara una `injections.scm` (vacío en las demás).
   *
   * Es lo que permite mandarle al worker los parsers EMBEBIDOS que va a
   * necesitar ANTES de correr la query: sin esto, un bloque de JS dentro de
   * markdown se quedaba con el color del padre.
   */
  injectionLanguages: string[]
}

/** Qué piezas del lenguaje quedaron disponibles (para el reporte honesto). */
export interface LanguageCapabilities {
  /** Hay gramática (tree-sitter o TextMate) → puede haber color. */
  highlighting: boolean
  /** Hay `tags.scm` → outline y goto-definition sin LSP. */
  symbols: boolean
  /** Hay `locals.scm` → alcances de variables. */
  locals: boolean
  /** Hay `injections.scm` o `embeddedLanguages` → lenguajes embebidos. */
  injections: boolean
  /** Hay `folds.scm` → plegado por árbol. */
  folding: boolean
  /** Hay `snippets` declarados. */
  snippets: boolean
  /** Hay `language-configuration.json`. */
  configuration: boolean
}

/** Lenguaje registrado (lo que el resto de la app consulta). */
export interface RegisteredLanguage {
  id: string
  aliases: string[]
  extensions: string[]
  filenames: string[]
  filenamePatterns: string[]
  firstLine?: string
  icon?: { light?: string; dark?: string }
  configurationPath?: string
  grammars: GrammarContribution[]
  snippets: SnippetContribution[]
  semanticTokenScopes: Record<string, string[]>
  configurationDefaults: Record<string, unknown>
  queries: LanguageQueryData[]
  capabilities: LanguageCapabilities
  /** Extensión dueña (para desinstalar limpio). */
  extensionId: string
}

// ── language-configuration.json ────────────────────────────────────────────

/** Par que se abre y se cierra (brackets, autoClosing, surrounding). */
export interface LanguagePair {
  open: string
  close: string
  notIn?: string[]
}

export interface LanguageConfiguration {
  lineComment?: string
  blockComment?: [string, string]
  brackets?: Array<[string, string]>
  autoClosingPairs?: LanguagePair[]
  surroundingPairs?: LanguagePair[]
  wordPattern?: string
  indentationRules?: {
    increaseIndentPattern?: string
    decreaseIndentPattern?: string
    indentNextLinePattern?: string
    unIndentedLinePattern?: string
  }
  onEnterRules?: Array<{
    beforeText?: string
    afterText?: string
    action?: { indent?: string; appendText?: string; removeText?: number }
  }>
  folding?: { offSide?: boolean; markers?: { start?: string; end?: string } }
}

function firstString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * Normaliza una lista de pares que acepta las DOS formas de VS Code: el par
 * suelto (`["(", ")"]`) y el objeto (`{ open, close, notIn }`).
 */
function parsePairs(value: unknown): LanguagePair[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: LanguagePair[] = []
  for (const item of value) {
    if (Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'string') {
      out.push({ open: item[0], close: item[1] })
      continue
    }
    if (item && typeof item === 'object') {
      const entry = item as Record<string, unknown>
      if (typeof entry.open === 'string' && typeof entry.close === 'string') {
        out.push({
          open: entry.open,
          close: entry.close,
          notIn: Array.isArray(entry.notIn)
            ? entry.notIn.filter((v): v is string => typeof v === 'string')
            : undefined
        })
      }
    }
  }
  return out.length > 0 ? out : undefined
}

function asPairs(value: unknown): Array<[string, string]> | undefined {
  if (!Array.isArray(value)) return undefined
  const out: Array<[string, string]> = []
  for (const item of value) {
    if (Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'string') {
      out.push([item[0], item[1]])
    }
  }
  return out.length > 0 ? out : undefined
}

/**
 * Normaliza un `language-configuration.json`.
 *
 * Tolera lo que VS Code tolera: `comments` puede traer `lineComment`,
 * `blockComment` o los dos; `autoClosingPairs` puede ser un objeto (con
 * `notIn`) o un par suelto; `folding` puede ser un objeto o un booleano.
 */
export function parseLanguageConfiguration(text: string): LanguageConfiguration | null {
  let raw: unknown
  try {
    raw = JSON.parse(stripJsonComments(text))
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const comments = (record.comments ?? {}) as Record<string, unknown>
  const block = comments.blockComment
  const folding = record.folding

  const autoClosingPairs = parsePairs(record.autoClosingPairs)

  const parsed: LanguageConfiguration = {
    lineComment: firstString(comments.lineComment),
    blockComment:
      Array.isArray(block) && typeof block[0] === 'string' && typeof block[1] === 'string'
        ? [block[0], block[1]]
        : undefined,
    brackets: asPairs(record.brackets),
    autoClosingPairs: autoClosingPairs && autoClosingPairs.length > 0 ? autoClosingPairs : undefined,
    surroundingPairs: parsePairs(record.surroundingPairs),
    wordPattern: firstString(record.wordPattern),
    indentationRules:
      record.indentationRules && typeof record.indentationRules === 'object'
        ? (record.indentationRules as LanguageConfiguration['indentationRules'])
        : undefined,
    onEnterRules: Array.isArray(record.onEnterRules)
      ? (record.onEnterRules as LanguageConfiguration['onEnterRules'])
      : undefined,
    folding:
      typeof folding === 'boolean'
        ? { offSide: folding }
        : folding && typeof folding === 'object'
          ? (folding as LanguageConfiguration['folding'])
          : undefined
  }

  // Un archivo sin NINGÚN campo conocido no aporta nada: se reporta como
  // inválido en vez de devolver un objeto lleno de `undefined`.
  const hasContent = Object.values(parsed).some((value) => value !== undefined)
  return hasContent ? parsed : null
}

/**
 * Quita los comentarios de un JSONC **sin tocar lo que está entre comillas**.
 *
 * Por qué no es un `.replace()`: `blockComment` se declara como un par de
 * strings que juntos forman el delimitador de apertura y el de cierre — o sea
 * que los marcadores de comentario aparecen DENTRO de un string. Un stripped
 * ingenuo con regex se come justamente ese valor y deja `blockComment` vacío
 * en TODOS los lenguajes. Por eso esto recorre el texto con estado
 * (dentro/fuera de string, con escapes) y sólo saca comentarios fuera de las
 * comillas.
 */
export function stripJsonComments(text: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      out += ch
      if (ch === '\\') {
        // Escape: el próximo carácter es literal, sea cual sea.
        if (i + 1 < text.length) out += text[++i]
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      out += ch
      continue
    }

    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
      continue
    }

    if (ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++ // salta el `/` de cierre (el `*` lo saltea el for)
      continue
    }

    out += ch
  }
  return out
}

// ── Snippets ───────────────────────────────────────────────────────────────

export interface Snippet {
  name: string
  prefix: string[]
  body: string
  description?: string
  scope?: string
}

/**
 * Normaliza un archivo de snippets.
 *
 * Acepta el formato canónico (mapa nombre → { prefix, body }) y el array de
 * objetos, y el `body` como string o como lista de líneas (que se une con
 * saltos, que es como lo escribe todo el mundo).
 */
export function parseSnippets(text: string, languageId?: string): Snippet[] {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return []
  }
  const out: Snippet[] = []

  const push = (name: string, value: unknown): void => {
    if (!value || typeof value !== 'object') return
    const entry = value as Record<string, unknown>
    const body = Array.isArray(entry.body)
      ? entry.body.filter((line): line is string => typeof line === 'string').join('\n')
      : firstString(entry.body)
    if (body === undefined) return
    const prefix = Array.isArray(entry.prefix)
      ? entry.prefix.filter((p): p is string => typeof p === 'string')
      : firstString(entry.prefix) !== undefined
        ? [firstString(entry.prefix) as string]
        : []
    if (prefix.length === 0) return
    out.push({
      name,
      prefix,
      body,
      description: firstString(entry.description),
      // VS Code permite `scope` por snippet; si no, es del lenguaje entero.
      scope: firstString(entry.scope) ?? languageId
    })
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      push(firstString(entry.name) ?? 'snippet', entry)
    }
  } else if (raw && typeof raw === 'object') {
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
      push(name, value)
    }
  }
  return out
}

// ── Asociación archivo → lenguaje ──────────────────────────────────────────

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Convierte un glob de VS Code a regex.
 *
 * `*` = cualquier cosa en un segmento, `**` = cualquier cosa (incluye `/`),
 * `?` = un carácter, `{a,b}` = alternativas. No es un glob completo, pero
 * cubre lo que usan las extensiones de lenguaje de verdad.
 */
export function globToRegExp(glob: string): RegExp {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        out += '.*'
        i++
      } else {
        out += '[^/]*'
      }
    } else if (ch === '?') {
      out += '[^/]'
    } else if (ch === '{') {
      const end = glob.indexOf('}', i)
      if (end > i) {
        const options = glob.slice(i + 1, end).split(',')
        out += `(?:${options.map(escapeRegex).join('|')})`
        i = end
      } else {
        out += '\\{'
      }
    } else {
      out += escapeRegex(ch)
    }
  }
  return new RegExp(`^${out}$`)
}

/** Cuántas extensiones tiene declaradas un lenguaje (para el desempate). */
function extensionCount(language: RegisteredLanguage): number {
  return language.extensions.length
}

/**
 * Elige el lenguaje de un archivo por asociación declarada.
 *
 * Orden (el de VS Code): nombre exacto → glob → extensión más larga → nada.
 * `firstLine` NO se evalúa aquí: requiere leer el archivo, así que va aparte
 * (`resolveLanguageByFirstLine`) y solo como último recurso.
 *
 * `disabled` permite excluir lenguajes desactivados por el usuario.
 */
export function resolveLanguageForPath(
  path: string,
  languages: RegisteredLanguage[],
  disabled?: Set<string>
): RegisteredLanguage | null {
  const name = basename(path)
  const candidates = languages.filter((language) => !disabled?.has(language.id))
  if (candidates.length === 0) return null

  // 1. Nombre exacto (case-sensitive primero, después sin distinguir).
  const byFilename = candidates.find((language) => language.filenames.includes(name))
  if (byFilename) return byFilename
  const byFilenameLoose = candidates.find((language) =>
    language.filenames.some((filename) => filename.toLowerCase() === name.toLowerCase())
  )
  if (byFilenameLoose) return byFilenameLoose

  // 2. Glob, con el patrón más largo ganando (más específico).
  let bestPattern: { language: RegisteredLanguage; length: number } | null = null
  for (const language of candidates) {
    for (const pattern of language.filenamePatterns) {
      if (!globToRegExp(pattern).test(name) && !globToRegExp(pattern).test(path)) continue
      if (!bestPattern || pattern.length > bestPattern.length) {
        bestPattern = { language, length: pattern.length }
      }
    }
  }
  if (bestPattern) return bestPattern.language

  // 3. Extensión MÁS LARGA ('.d.ts' antes que '.ts'), como VS Code.
  let bestExtension: { language: RegisteredLanguage; length: number } | null = null
  const lowerName = name.toLowerCase()
  for (const language of candidates) {
    for (const extension of language.extensions) {
      if (!lowerName.endsWith(extension.toLowerCase())) continue
      if (!bestExtension || extension.length > bestExtension.length) {
        bestExtension = { language, length: extension.length }
      }
    }
  }
  return bestExtension?.language ?? null
}

/** Último recurso: la primera línea (shebang) contra los `firstLine`. */
export function resolveLanguageByFirstLine(
  firstLineText: string,
  languages: RegisteredLanguage[]
): RegisteredLanguage | null {
  for (const language of languages) {
    if (!language.firstLine) continue
    try {
      if (new RegExp(language.firstLine).test(firstLineText)) return language
    } catch {
      // Un regex inválido no debe romper la apertura del archivo.
    }
  }
  return null
}

export { extensionCount }

// ── Registry ───────────────────────────────────────────────────────────────

/**
 * Lee TODAS las queries declaradas y las clasifica.
 *
 * Nunca descarta: una query desconocida entra como `unknown` con su nombre, y
 * un archivo que no se puede leer queda registrado con `captures` vacío (para
 * que el reporte diga "declarada pero ilegible" en vez de fingir que no está).
 */
export async function loadQueryData(
  grammars: GrammarContribution[],
  queriesDir: string | undefined,
  readQuery: (path: string) => Promise<string | null>
): Promise<LanguageQueryData[]> {
  const files: string[] = []
  for (const grammar of grammars) {
    if (grammar.kind !== 'treeSitter') continue
    files.push(...grammar.queries)
  }
  if (files.length === 0 && queriesDir) {
    // Solo builtin: el handler resuelve el directorio con glob antes de llegar
    // aquí. Si llegó igual, se deja constancia en el log en vez de silencio.
    console.warn(`[languages] queriesDir sin enumerar: ${queriesDir}`)
  }

  const classified = listQueryFiles([...new Set(files)])
  const out: LanguageQueryData[] = []
  for (const entry of classified) {
    const text = await readQuery(entry.file)
    const info = describeQueryCategory(entry.category)
    out.push({
      file: entry.file,
      category: entry.category,
      label: entry.label,
      layer: info.layer,
      variant: entry.variant,
      captures: text ? capturesOf(text) : [],
      injectionLanguages:
        entry.category === 'injections' && text ? injectionLanguagesOf(text) : []
    })
  }
  return out
}

class LanguageRegistryClass {
  private languages = new Map<string, RegisteredLanguage>()
  private ownedBy = new Map<string, string[]>()
  private disabled = new Set<string>()
  private navigators = new Map<string, RegisteredLanguage>()
  private listeners = new Set<() => void>()

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // Un suscriptor roto no debe tumbar a los demás.
      }
    }
  }

  register(language: RegisteredLanguage): void {
    this.languages.set(language.id, language)
    const owned = this.ownedBy.get(language.extensionId) ?? []
    if (!owned.includes(language.id)) owned.push(language.id)
    this.ownedBy.set(language.extensionId, owned)
    // El lenguaje "navegador" de VS Code: el que resuelve el split del editor.
    if (language.aliases.includes('navegador')) this.navigators.set(language.id, language)
    this.emit()
  }

  get(id: string): RegisteredLanguage | null {
    return this.languages.get(id) ?? null
  }

  getAll(): RegisteredLanguage[] {
    return [...this.languages.values()]
  }

  languageIds(): string[] {
    return [...this.languages.keys()].sort()
  }

  /** Resuelve el lenguaje de un archivo (respetando los desactivados). */
  forPath(path: string): RegisteredLanguage | null {
    return resolveLanguageForPath(path, [...this.languages.values()], this.disabled)
  }

  /** Queries de un lenguaje, tal cual salieron del indexado. */
  queriesOf(languageId: string): LanguageQueryData[] {
    return this.languages.get(languageId)?.queries ?? []
  }

  setDisabled(languageId: string, value: boolean): void {
    if (value) this.disabled.add(languageId)
    else this.disabled.delete(languageId)
    this.emit()
  }

  isDisabled(languageId: string): boolean {
    return this.disabled.has(languageId)
  }

  /** Quita los lenguajes de una extensión (desinstalación). */
  unregisterExtension(extensionId: string): void {
    const owned = this.ownedBy.get(extensionId) ?? []
    for (const id of owned) {
      this.languages.delete(id)
      this.navigators.delete(id)
    }
    this.ownedBy.delete(extensionId)
    this.emit()
  }
}

export const LanguageRegistry = new LanguageRegistryClass()
