// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Queries de tree-sitter: cargar TODAS, categorizarlas y repartirlas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ALCANZA CON "highlights.scm"
 *
 * Una gramática de tree-sitter no viene sola: viene con un directorio de
 * queries, y cada `.scm` produce un TIPO DE DATO distinto:
 *
 *   highlights.scm  → spans de color
 *   injections.scm  → rangos que son OTRO lenguaje (lo que VS Code llama
 *                     `embeddedLanguages` / `injectTo`)
 *   locals.scm      → definiciones/alcances de variables
 *   tags.scm        → definiciones y referencias = SÍMBOLOS y goto-definition
 *   folds.scm       → rangos plegables
 *   indents.scm     → reglas de indentación
 *   textobjects.scm → rangos de selección
 *   rainbows.scm    → pares de delimitadores anidados (color de arcoíris)
 *
 * Hoy el engine abre sólo `highlights.scm` e `injections.scm`: `tags.scm` y
 * `locals.scm` están en el repo **y nunca se leen**. La regla aquí es la
 * contraria a propósito: se carga **todo** `.scm`, se le pone su categoría, y
 * lo que no se reconoce viaja igual como `unknown` con su nombre real. El IDE
 * decide dónde pintar el dato; la capa de sintaxis no descarta nada.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Qué produce una query (el IDE decide dónde lo pinta). */
export type QueryCategory =
  | 'highlights'
  | 'injections'
  | 'locals'
  | 'tags'
  | 'folds'
  | 'indents'
  | 'textobjects'
  | 'rainbows'
  | 'unknown'

/** Dónde se puede pintar el dato que produce una query. */
export type SyntaxLayer = 'text' | 'underline' | 'background' | 'border' | 'overviewRuler' | 'inline' | 'gutter'

export interface QueryCategoryInfo {
  category: QueryCategory
  label: string
  /** Qué dato sale de esta query. */
  produces: string
  /** Capa por defecto donde el IDE lo pinta. */
  layer: SyntaxLayer
}

const CATEGORY_INFO: Record<QueryCategory, Omit<QueryCategoryInfo, 'category'>> = {
  highlights: {
    label: 'Resaltado',
    produces: 'spans (rango + scope) para colorear texto',
    layer: 'text'
  },
  injections: {
    label: 'Inyecciones',
    produces: 'rangos que pertenecen a OTRO lenguaje (embeddedLanguages de VS Code)',
    layer: 'text'
  },
  locals: {
    label: 'Locales',
    produces: 'definiciones y referencias de variables (alcances)',
    layer: 'background'
  },
  tags: {
    label: 'Símbolos (tags)',
    produces: 'definiciones y referencias: outline, breadcrumb y goto-definition SIN LSP',
    layer: 'gutter'
  },
  folds: {
    label: 'Plegado',
    produces: 'rangos plegables',
    layer: 'inline'
  },
  indents: {
    label: 'Indentación',
    produces: 'reglas de indentación por nodo',
    layer: 'inline'
  },
  textobjects: {
    label: 'Objetos de texto',
    produces: 'rangos de selección (función, clase, parámetro)',
    layer: 'background'
  },
  rainbows: {
    label: 'Arcoíris de delimitadores',
    produces: 'pares de delimitadores anidados, para colorearlos por profundidad',
    layer: 'text'
  },
  unknown: {
    label: 'Query sin categoría conocida',
    produces: 'los datos crudos del query: se cargan igual y el IDE decide',
    layer: 'background'
  }
}

/**
 * Categoría de un archivo `.scm` a partir de su nombre.
 *
 * Acepta variantes y prefijos (`highlights-jsx.scm`, `injections-params.scm`),
 * rutas (`queries/typescript/highlights.scm`) y mayúsculas raras. Lo que no
 * reconoce NO se descarta: cae en `unknown` con su nombre.
 */
export function categorizeQueryFile(file: string): QueryCategory {
  const base = file
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.toLowerCase()
    .replace(/\.scm$/, '')
  if (!base) return 'unknown'

  // `highlights-jsx` → `highlights`: el prefijo antes del guion manda.
  const head = base.split('-')[0]
  switch (head) {
    case 'highlights':
    case 'highlight':
      return 'highlights'
    case 'injections':
    case 'injection':
      return 'injections'
    case 'locals':
    case 'local':
      return 'locals'
    case 'tags':
    case 'tag':
      return 'tags'
    case 'folds':
    case 'fold':
      // `folds.scm` plegado; `fold*.scm` de terceros también.
      return 'folds'
    case 'indents':
    case 'indent':
      return 'indents'
    case 'textobjects':
    case 'textobject':
      return 'textobjects'
    // `rainbows.scm` (Helix) y `rainbow-delimiters.scm` (nvim) son el MISMO dato.
    case 'rainbows':
    case 'rainbow':
      return 'rainbows'
    default:
      return 'unknown'
  }
}

/** Descripción de una categoría (para UI y reporte de instalación). */
export function describeQueryCategory(category: QueryCategory): QueryCategoryInfo {
  return { category, ...CATEGORY_INFO[category] }
}

/** Una query lista para consumir: nunca se pierde ninguna. */
export interface QueryFile {
  /** Nombre del archivo tal como lo declaró la extensión. */
  file: string
  /** Categoría (o `unknown`). */
  category: QueryCategory
  /** Variante después del guion: `highlights-jsx` → `jsx`. */
  variant: string | null
  /** Capas donde el IDE puede pintar este dato. */
  layer: SyntaxLayer
  label: string
}

/** Clasifica una lista de archivos SIN descartar ninguno (orden estable). */
export function listQueryFiles(files: string[]): QueryFile[] {
  return files.map((file) => {
    const category = categorizeQueryFile(file)
    const info = describeQueryCategory(category)
    const base = file.replace(/\\/g, '/').split('/').pop() ?? file
    const stem = base.replace(/\.scm$/i, '')
    const dash = stem.indexOf('-')
    return {
      file,
      category,
      variant: dash >= 0 ? stem.slice(dash + 1).toLowerCase() || null : null,
      layer: info.layer,
      label: info.label
    }
  })
}

/**
 * Captures declarados en el texto de una query (`@foo.bar`).
 *
 * Son el `scope` de la fuente tree-sitter: es lo mismo que resuelve
 * `resolveScopeStyle` (ver `scopes.ts`). Se extraen para que el IDE sepa de
 * antemano qué scopes puede producir una gramática — sin ejecutarla.
 */
export function capturesOf(queryText: string): string[] {
  const seen = new Set<string>()
  // `@nombre.del.scope` (puede venir seguido de `.` o de más captures).
  const regex = /@([a-zA-Z_][a-zA-Z0-9_.+-]*)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(queryText)) !== null) {
    // Un capture no termina en punto (el replace de abajo lo cubre) ni lleva
    // el `.` de una conjunción de captures.
    const name = match[1].replace(/\.+$/, '')
    if (name) seen.add(name)
  }
  return [...seen]
}

/**
 * Lenguajes que una `injections.scm` declara, leídos SIN ejecutar la query.
 *
 * Existe porque el tokenizado dinámico necesita saber de antemano qué parsers
 * mandar al worker: el tramo embebido hay que parsearlo con el parser de SU
 * lenguaje, y el worker no tiene el registro de lenguajes (ni debe tenerlo).
 * Se reconocen las dos formas de declararlo:
 *
 *   (#set! injection.language "javascript")
 *   ("" @injection.language)      ← el texto capturado ES el lenguaje
 *
 * Devuelve lo que puede: una inyección cuyo lenguaje se resuelve en runtime
 * (una variable, un string concatenado) no se puede adivinar aquí, y eso está
 * bien: el tramo queda con el color del lenguaje raíz y se reporta.
 */
export function injectionLanguagesOf(queryText: string): string[] {
  const out = new Set<string>()
  const setPattern = /injection\.language\s+"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = setPattern.exec(queryText)) !== null) {
    const name = match[1].trim()
    if (name) out.add(name)
  }
  return [...out]
}

/**
 * Captures de una query con su tipo estándar: `@string` → String, `@comment`
 * → Comment. Es lo que el editor necesita para brackets balanceados, spell
 * check y "¿estoy dentro de un comentario?" sin mirar el color.
 */
export interface QueryCapture {
  scope: string
  standardTokenType: number
}

export function capturesWithType(queryText: string, toStandard: (scope: string) => number): QueryCapture[] {
  return capturesOf(queryText).map((scope) => ({ scope, standardTokenType: toStandard(scope) }))
}
