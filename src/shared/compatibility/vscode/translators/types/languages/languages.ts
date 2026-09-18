/**
 * Traductor languages: una extensión de LENGUAJE de VS Code → un kit SEF.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ TRADUCE Y POR QUÉ ASÍ
 *
 * Una extensión de lenguaje de VS Code no trae una cosa, trae un kit:
 *
 *   contributes.languages[]            → identidad + asociación de archivos
 *   contributes.languages[].configuration → language-configuration.json
 *   contributes.grammars[]             → el tokenizador TextMate
 *   contributes.snippets[]             → snippets
 *   contributes.semanticTokenScopes[]  → mapeo tokenType → scope (lado LSP)
 *   contributes.configurationDefaults  → defaults de editor por lenguaje
 *
 * Todo eso entra en UNA contribución `languages` (ver el schema del tipo). Los
 * assets se copian al `.sef` con su ruta original porque el manifest SEF los
 * referencia por esa ruta.
 *
 * Lo que NO se toca: el código (`main`) de la extensión, si lo tiene. Un
 * language server propio corre por el Extension Host y/o por `lspServers`; acá
 * sólo se traduce la parte declarativa, que es la que se puede traducir.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { MappedApi, VsixFileEntry, VsixPackageJson } from '../../../../types'
import { decodeText, resolveVsixFile } from '../../../extract'

export interface LanguagesTranslation {
  contributions: Array<Record<string, unknown>>
  assets: Map<string, string | Uint8Array>
  mapped: MappedApi[]
}

interface VsixLanguage {
  id?: string
  aliases?: unknown
  extensions?: unknown
  filenames?: unknown
  filenamePatterns?: unknown
  firstLine?: string
  configuration?: string
  icon?: { light?: string; dark?: string } | string
}

interface VsixGrammar {
  language?: string
  scopeName?: string
  path?: string
  embeddedLanguages?: Record<string, string>
  tokenTypes?: Record<string, string>
  injectTo?: string[]
  balancedBracketScopes?: string[]
  unbalancedBracketScopes?: string[]
}

interface VsixSnippet {
  language?: string
  path?: string
}

/** ¿La extensión declara algo de la familia de lenguajes? */
export function detectLanguages(manifest: VsixPackageJson): boolean {
  const contributes = (manifest.contributes ?? {}) as Record<string, unknown>
  const lists = ['languages', 'grammars', 'snippets', 'semanticTokenScopes']
  for (const key of lists) {
    const value = contributes[key]
    if (Array.isArray(value) && value.length > 0) return true
  }
  return Boolean(contributes.configurationDefaults)
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  // VS Code acepta un objeto suelto donde la doc dice lista.
  return value && typeof value === 'object' ? [value as T] : []
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * Copia un asset del .vsix al paquete SEF y devuelve su ruta, o null si no
 * está. La ruta se conserva (normalizada) porque el manifest la referencia.
 */
function copyAsset(
  path: string,
  files: VsixFileEntry[],
  assets: Map<string, string | Uint8Array>
): string | null {
  const entry = resolveVsixFile(path, files)
  if (!entry) return null
  const target = normalizePath(entry.path)
  if (!assets.has(target)) assets.set(target, entry.data)
  return target
}

/** Un `.tmLanguage` puede ser JSON o plist XML (VS Code acepta los dos). */
function isPlist(text: string): boolean {
  return text.trimStart().startsWith('<?xml') || text.trimStart().startsWith('<plist')
}

export function translateLanguages(
  manifest: VsixPackageJson,
  files: VsixFileEntry[],
  _opts: { extensionId: string }
): LanguagesTranslation {
  const contributes = (manifest.contributes ?? {}) as Record<string, unknown>
  const declared = asArray<VsixLanguage>(contributes.languages)
  const grammars = asArray<VsixGrammar>(contributes.grammars)
  const snippets = asArray<VsixSnippet>(contributes.snippets)
  const semanticTokenScopes = asArray<{ language?: string; scopes?: Record<string, string[]> }>(
    contributes.semanticTokenScopes
  )
  const configurationDefaults = (contributes.configurationDefaults ?? {}) as Record<string, unknown>

  const assets = new Map<string, string | Uint8Array>()
  const mapped: MappedApi[] = []
  const contributions: Array<Record<string, unknown>> = []

  /** Defaults de editor por lenguaje (las claves `[lang]` de configurationDefaults). */
  const defaultsByLanguage = new Map<string, Record<string, unknown>>()
  for (const [key, value] of Object.entries(configurationDefaults)) {
    const match = /^\[(.+)\]$/.exec(key.trim())
    if (match && value && typeof value === 'object') {
      defaultsByLanguage.set(match[1], value as Record<string, unknown>)
    } else {
      // Un default global (sin `[lang]`) no es de un lenguaje: se reporta.
      mapped.push({
        source: `contributes.configurationDefaults.${key}`,
        target: null,
        support: 'partial',
        note: 'default de editor global (no atado a un lenguaje): lo aplica el sistema de configuración, no el kit de lenguaje'
      })
    }
  }

  // ── Kit por lenguaje declarado ───────────────────────────────────────────
  const usedSnippets = new Set<VsixSnippet>()
  const usedGrammars = new Set<VsixGrammar>()

  const kitFor = (id: string, source: VsixLanguage | null): Record<string, unknown> => {
    const kit: Record<string, unknown> = { id }

    if (source) {
      const aliases = stringsOf(source.aliases)
      const extensions = stringsOf(source.extensions)
      const filenames = stringsOf(source.filenames)
      const patterns = stringsOf(source.filenamePatterns)
      if (aliases.length > 0) kit.aliases = aliases
      if (extensions.length > 0) kit.extensions = extensions
      if (filenames.length > 0) kit.filenames = filenames
      if (patterns.length > 0) kit.filenamePatterns = patterns
      if (typeof source.firstLine === 'string') kit.firstLine = source.firstLine

      // language-configuration.json
      if (typeof source.configuration === 'string') {
        const copied = copyAsset(source.configuration, files, assets)
        if (copied) kit.configuration = copied
        else {
          mapped.push({
            source: `contributes.languages[${id}].configuration`,
            target: null,
            support: 'none',
            note: `el archivo ${source.configuration} no está en el paquete`
          })
        }
      }

      // Iconos del lenguaje (light/dark).
      const icon =
        typeof source.icon === 'string'
          ? { light: source.icon, dark: source.icon }
          : source.icon && typeof source.icon === 'object'
            ? source.icon
            : null
      if (icon && (icon.light || icon.dark)) {
        const light = icon.light ? copyAsset(icon.light, files, assets) : null
        const dark = icon.dark ? copyAsset(icon.dark, files, assets) : null
        if (light || dark) kit.icon = { light: light ?? undefined, dark: dark ?? undefined }
      }
    }

    // ── Gramáticas del lenguaje ────────────────────────────────────────────
    const scopeNames = new Set(
      grammars.filter((g) => g.language === id && g.scopeName).map((g) => g.scopeName as string)
    )
    const ownGrammars: Array<Record<string, unknown>> = []
    for (const grammar of grammars) {
      // Se toma si declara este lenguaje, o si es una gramática de inyección
      // (`language` sin declarar). Para las de inyección hay DOS casos reales:
      //
      //  a) inyecta en un scope que este mismo paquete provee (el caso
      //     "overlay" clásico);
      //  b) inyecta en OTRO lenguaje y declara qué lenguaje EMBEBE
      //     (`embeddedLanguages: { 'meta.embedded.block.gleam': 'gleam' }`) —
      //     el bloque de código de markdown es sintaxis de GLEAM, así que su
      //     kit es el de gleam. Sin esta rama se caía (era el caso de la
      //     extensión real de Gleam: su gramática de markdown quedaba huérfana
      //     con `language` ausente e `injectTo: ['text.html.markdown']`).
      const embeddedLanguages = Object.values(grammar.embeddedLanguages ?? {})
      const belongs =
        grammar.language === id ||
        (!grammar.language && Boolean(grammar.injectTo?.some((scope) => scopeNames.has(scope)))) ||
        (!grammar.language && embeddedLanguages.includes(id))
      if (!belongs) continue
      if (typeof grammar.scopeName !== 'string' || typeof grammar.path !== 'string') continue

      const copied = copyAsset(grammar.path, files, assets)
      if (!copied) {
        mapped.push({
          source: `contributes.grammars[${grammar.scopeName}]`,
          target: null,
          support: 'none',
          note: `el archivo ${grammar.path} no está en el paquete`
        })
        continue
      }

      usedGrammars.add(grammar)
      const entry: Record<string, unknown> = {
        kind: 'textMate',
        scopeName: grammar.scopeName,
        path: copied
      }
      if (grammar.embeddedLanguages) entry.embeddedLanguages = grammar.embeddedLanguages
      if (grammar.tokenTypes) entry.tokenTypes = grammar.tokenTypes
      if (grammar.injectTo?.length) entry.injectTo = grammar.injectTo
      if (grammar.balancedBracketScopes?.length) entry.balancedBracketScopes = grammar.balancedBracketScopes
      if (grammar.unbalancedBracketScopes?.length) {
        entry.unbalancedBracketScopes = grammar.unbalancedBracketScopes
      }
      ownGrammars.push(entry)

      // Un `.tmLanguage` en plist XML se copia igual, pero se avisa: el
      // tokenizador necesita un parser de plist.
      const asset = assets.get(copied)
      if (asset instanceof Uint8Array) {
        const text = decodeText(asset)
        if (isPlist(text)) {
          mapped.push({
            source: `contributes.grammars[${grammar.scopeName}].path`,
            target: `languages[${id}].grammars`,
            support: 'partial',
            note: 'gramática en formato plist XML: se copia, pero el tokenizador hoy lee JSON'
          })
        }
      }
    }
    if (ownGrammars.length > 0) kit.grammars = ownGrammars

    // ── Snippets del lenguaje ──────────────────────────────────────────────
    const ownSnippets: Array<{ path: string }> = []
    for (const snippet of snippets) {
      if (snippet.language !== id || typeof snippet.path !== 'string') continue
      const copied = copyAsset(snippet.path, files, assets)
      if (!copied) {
        mapped.push({
          source: `contributes.snippets[${id}]`,
          target: null,
          support: 'none',
          note: `el archivo ${snippet.path} no está en el paquete`
        })
        continue
      }
      usedSnippets.add(snippet)
      ownSnippets.push({ path: copied })
    }
    if (ownSnippets.length > 0) kit.snippets = ownSnippets

    // ── semanticTokenScopes ────────────────────────────────────────────────
    // Los del lenguaje + los globales (sin `language`), que aplican a todos.
    const scopes = semanticTokenScopes.filter(
      (entry) => entry.language === id || entry.language === undefined
    )
    if (scopes.length > 0) {
      kit.semanticTokenScopes = scopes.map((entry) => ({
        language: entry.language ?? id,
        scopes: entry.scopes ?? {}
      }))
    }

    // ── Defaults de editor ────────────────────────────────────────────────
    const defaults = defaultsByLanguage.get(id)
    if (defaults) kit.configurationDefaults = defaults

    return kit
  }

  for (const language of declared) {
    if (typeof language.id !== 'string' || language.id.length === 0) continue
    contributions.push(kitFor(language.id, language))
  }

  // ── Gramáticas huérfanas ─────────────────────────────────────────────────
  // Gramáticas que declaran un lenguaje NO declarado en `contributes.languages`
  // (pasa seguido: la gramática se apoya en un lenguaje que aporta otra
  // extensión). Se conservan en su propio kit en vez de perderse.
  const orphanGrammars = grammars.filter((g) => g.language && !declared.some((l) => l.id === g.language))
  for (const orphan of orphanGrammars) {
    if (!orphan.language || usedGrammars.has(orphan)) continue
    contributions.push(kitFor(orphan.language, null))
  }

  // ── Reporte honesto, pieza por pieza ─────────────────────────────────────
  if (declared.length > 0) {
    mapped.push({
      source: 'contributes.languages',
      target: 'languages',
      support: 'full',
      note: `${declared.length} lenguaje(s): asociación de archivos, configuración y defaults`
    })
  }
  if (usedGrammars.size > 0) {
    mapped.push({
      source: 'contributes.grammars',
      target: 'languages[].grammars (textMate)',
      support: 'partial',
      note: `${usedGrammars.size} gramática(s) copiadas para el tokenizador TextMate; el color depende de que el tokenizador esté activo`
    })
  }
  if (usedSnippets.size > 0) {
    mapped.push({
      source: 'contributes.snippets',
      target: 'languages[].snippets',
      support: 'full',
      note: `${usedSnippets.size} archivo(s) de snippets`
    })
  }
  if (semanticTokenScopes.length > 0) {
    mapped.push({
      source: 'contributes.semanticTokenScopes',
      target: 'languages[].semanticTokenScopes',
      support: 'partial',
      note: 'mapeo tokenType → scope guardado; se aplica cuando el LSP manda semantic tokens'
    })
  }
  if (orphanGrammars.length > 0) {
    mapped.push({
      source: 'contributes.grammars (lenguaje no declarado)',
      target: 'languages',
      support: 'partial',
      note: `${orphanGrammars.length} gramática(s) de lenguajes que aporta otra extensión: se conservan como kit propio`
    })
  }
  if (contributes.semanticTokenTypes || contributes.semanticTokenModifiers) {
    mapped.push({
      source: 'contributes.semanticTokenTypes / semanticTokenModifiers',
      target: null,
      support: 'partial',
      note: 'tipos/modificadores propios: la leyenda que manda el language server ya los incluye'
    })
  }

  return { contributions, assets, mapped }
}
