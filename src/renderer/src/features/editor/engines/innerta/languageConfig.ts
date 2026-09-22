/**
 * Config del LENGUAJE (pares de auto-cierre y comentarios) para el motor.
 *
 * Dos fuentes, en orden:
 *  1. El `language-configuration.json` que declare el lenguaje (extensiones
 *     VS Code y paquetes SEF). Es la fuente canónica del lenguaje.
 *  2. La tabla REAL de abajo, por lenguaje. NO es una heurística: son los pares
 *     de cada lenguaje (los mismos que declara su configuración oficial). El
 *     motor no inventa nada: si un lenguaje no está acá ni trae config, no hay
 *     auto-pairing.
 */

import {
  LanguageRegistry,
  parseLanguageConfiguration,
  type LanguageConfiguration
} from '@services/extensions/types/languages/logic'
import { detectLanguageFromPath } from '@features/editor/languages'

/** Pares del lenguaje tal como los espera el motor (`openers`/`closers`). */
export interface AutoPairs {
  openers: string
  closers: string
}

interface LanguageDefaults {
  /** Pares de un solo carácter (open, close). */
  pairs: Array<[string, string]>
  lineComment?: string
  blockComment?: [string, string]
}

/** Pares genéricos de los lenguajes con llaves/corchetes/paréntesis/comillas. */
const C_LIKE: Array<[string, string]> = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['"', '"'],
  ["'", "'"],
  ['`', '`']
]
const BRACES_ONLY: Array<[string, string]> = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['"', '"'],
  ["'", "'"]
]

/**
 * Pares/comentarios REALES por lenguaje. La clave es el id del motor
 * (`languages.ts`). Lo que no está acá no auto-cierra (a propósito).
 */
const DEFAULTS: Record<string, LanguageDefaults> = {
  javascript: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  typescript: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  tsx: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  c: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  cpp: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  c_sharp: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  java: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  kotlin: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  swift: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  dart: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  rust: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  go: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  zig: { pairs: C_LIKE, lineComment: '//' },
  php: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  svelte: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  sql: { pairs: BRACES_ONLY, lineComment: '--', blockComment: ['/*', '*/'] },
  css: { pairs: BRACES_ONLY, blockComment: ['/*', '*/'] },
  scss: { pairs: BRACES_ONLY, lineComment: '//', blockComment: ['/*', '*/'] },
  less: { pairs: BRACES_ONLY, lineComment: '//', blockComment: ['/*', '*/'] },
  html: { pairs: BRACES_ONLY.concat([['<', '>']]), blockComment: ['<!--', '-->'] },
  vue: { pairs: C_LIKE, lineComment: '//', blockComment: ['/*', '*/'] },
  json: { pairs: [['(', ')'], ['[', ']'], ['{', '}'], ['"', '"']] },
  yaml: { pairs: BRACES_ONLY, lineComment: '#' },
  toml: { pairs: BRACES_ONLY, lineComment: '#' },
  python: { pairs: BRACES_ONLY, lineComment: '#', blockComment: ['"""', '"""'] },
  ruby: { pairs: BRACES_ONLY, lineComment: '#', blockComment: ['=begin', '=end'] },
  lua: { pairs: BRACES_ONLY, lineComment: '--', blockComment: ['--[[', ']]'] },
  elixir: { pairs: BRACES_ONLY, lineComment: '#', blockComment: ['"""', '"""'] },
  graphql: { pairs: BRACES_ONLY, lineComment: '#' },
  prisma: { pairs: BRACES_ONLY, lineComment: '//' },
  hcl: { pairs: BRACES_ONLY, lineComment: '#', blockComment: ['/*', '*/'] },
  terraform: { pairs: BRACES_ONLY, lineComment: '#', blockComment: ['/*', '*/'] },
  cmake: { pairs: BRACES_ONLY, lineComment: '#' },
  dockerfile: { pairs: BRACES_ONLY, lineComment: '#' },
  bash: { pairs: BRACES_ONLY, lineComment: '#' },
  markdown: { pairs: BRACES_ONLY, blockComment: ['<!--', '-->'] }
}

/** Unidades de indentación REALES por lenguaje (el resto usa 4 espacios). */
const INDENT_UNITS: Record<string, string> = {
  go: '\t',
  make: '\t',
  dockerfile: '\t'
}

/** Unidad de indentación del lenguaje (`\t` o N espacios). */
export function indentUnitFor(languageId: string | null): string {
  if (!languageId) return '    '
  return INDENT_UNITS[languageId] ?? '    '
}

const fileCache = new Map<string, Promise<LanguageConfiguration | null>>()

async function readConfiguration(path: string): Promise<LanguageConfiguration | null> {
  try {
    const result = await window.api.fs.readFile(path)
    if (!result.success || typeof result.content !== 'string') return null
    return parseLanguageConfiguration(result.content)
  } catch {
    return null
  }
}

/** Pares de un `LanguageConfiguration` (sólo los de un carácter). */
function pairsFromConfiguration(config: LanguageConfiguration): AutoPairs | null {
  const declared =
    config.autoClosingPairs && config.autoClosingPairs.length > 0
      ? config.autoClosingPairs.map((pair) => [pair.open, pair.close] as [string, string])
      : (config.brackets ?? []).map(([open, close]) => [open, close] as [string, string])
  return pairsFromList(declared)
}

function pairsFromList(pairs: Array<[string, string]>): AutoPairs | null {
  let openers = ''
  let closers = ''
  for (const [open, close] of pairs) {
    if (open.length !== 1 || close.length !== 1) continue
    openers += open
    closers += close
  }
  return openers ? { openers, closers } : null
}

/** Comentarios del lenguaje (config propia o tabla real); null si no hay. */
export function languageComments(
  languageId: string | null
): { line?: string; block?: [string, string] } | null {
  if (!languageId) return null
  const defaults = DEFAULTS[languageId]
  return defaults ? { line: defaults.lineComment, block: defaults.blockComment } : null
}

/**
 * Pares de auto-cierre del archivo, según su lenguaje: la config del lenguaje
 * si existe, si no su tabla real. `null` = no auto-cierra.
 */
export async function autoPairsForPath(filePath: string): Promise<AutoPairs | null> {
  const languageId = detectLanguageFromPath(filePath)
  if (!languageId) return null

  const configurationPath = LanguageRegistry.get(languageId)?.configurationPath
  if (configurationPath) {
    let pending = fileCache.get(configurationPath)
    if (!pending) {
      pending = readConfiguration(configurationPath)
      fileCache.set(configurationPath, pending)
    }
    const config = await pending
    const fromConfig = config ? pairsFromConfiguration(config) : null
    if (fromConfig) return fromConfig
  }

  const defaults = DEFAULTS[languageId]
  return defaults ? pairsFromList(defaults.pairs) : null
}
