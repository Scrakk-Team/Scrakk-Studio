// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Capturas de tree-sitter → los datos que consume el IDE (además del color).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * El tokenizador devolvía SÓLO color: cargaba `tags.scm`, `folds.scm`,
 * `injections.scm`… y las ignoraba (`if (category !== 'highlights') continue`).
 * Eso dejaba sin usar lo que más valor tiene de un parser: el árbol sabe dónde
 * está cada función, qué tramos son otro lenguaje, qué se pliega y a qué
 * definición apunta una variable — y todo eso se estaba tirando.
 *
 * Todas las funciones de aquí son PURAS (no tocan wasm ni disco): reciben
 * capturas ya extraídas del árbol y texto, y devuelven datos. Por eso se pueden
 * testear con capturas escritas a mano.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONVENCIONES QUE SE ASUMEN (las de tree-sitter, no inventadas)
 *
 *   tags.scm        `@definition.function` + `@name` adentro (o el texto del
 *                   propio capture si es un identificador). Igual `@reference.*`.
 *   folds.scm       `@fold` (o `@fold.comment`, con el kind en el sufijo).
 *   locals.scm      `@local.definition[.X]`, `@local.reference`, `@local.scope`.
 *   textobjects.scm `@function.inner` / `@class.outer` (o prefijo `textobject.`).
 *   injections.scm  `@injection.content` + `#set! injection.language "x"` (o un
 *                   capture `@injection.language`); `injection.combined` opcional.
 *
 * Lo que no siga la convención NO se descarta con un throw: se ignora ese dato
 * (el archivo sigue con su color). Descartar todo por una query rara sería peor.
 */

import type {
  DynamicFoldRange,
  DynamicInjectionRange,
  DynamicLocalEntry,
  DynamicSymbolNode,
  DynamicTextObject
} from '@shared/extensions'
import { lineStarts, positionAt, type RawCapture } from './scopes'

/**
 * Un match de una query, con sus propiedades `#set!`.
 *
 * `injections.scm` NO se puede leer sólo con capturas: el lenguaje inyectado
 * suele venir en un `#set!` del match (o del capture), y esa información no
 * está en el nombre del capture. Por eso el tokenizador arma matches.
 */
export interface RawMatch {
  captures: RawCapture[]
  /** Propiedades del match (`#set!`), aplanadas. */
  properties: Record<string, string | null>
}

/** Rango de una captura en líneas y columnas (ya en el espacio del motor). */
interface CaptureRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

/**
 * Captura → rango de líneas/columnas, con el fin EXCLUSIVO.
 *
 * El índice de fin de tree-sitter es exclusivo, y eso rompe todo lo que use
 * `endLine` (plegado, outline, inyecciones) cuando el nodo termina justo en un
 * salto de línea: `positionAt(end)` cae en la columna 0 de la línea SIGUIENTE,
 * así que una función de 4 líneas se reportaba como de 5 y su rango plegable
 * se comía la línea en blanco de abajo.
 *
 * Por eso el fin se calcula desde el ÚLTIMO CARÁCTER capturado (no desde el
 * índice de fin): su línea es la línea real del cierre y su columna + 1 es el
 * fin exclusivo dentro de esa línea.
 */
function rangeOf(capture: RawCapture, starts: number[]): CaptureRange {
  const from = positionAt(Math.max(0, capture.start), starts)
  const lastIndex = Math.max(capture.start, capture.end - 1)
  const last = positionAt(lastIndex, starts)
  return {
    startLine: from.line,
    startColumn: from.column,
    endLine: last.line,
    endColumn: last.column + 1
  }
}

/** `e.start <= x.start && x.end <= e.end` (contención estricta de índices). */
function contains(outer: RawCapture, inner: RawCapture): boolean {
  return outer.start <= inner.start && inner.end <= outer.end
}

/** Texto de una captura, recortado al largo del texto (parsers tercos). */
function textOf(capture: RawCapture, text: string): string {
  return text.slice(Math.max(0, capture.start), Math.min(capture.end, text.length))
}

/** Nombre del capture sin el sufijo del prefijo dado (`definition.` → resto). */
function suffixOf(name: string, prefix: string): string | null {
  if (!name.startsWith(prefix)) return null
  const rest = name.slice(prefix.length)
  return rest.length > 0 ? rest : null
}

// ── Símbolos (tags.scm) ───────────────────────────────────────────────────

/** Último segmento del capture: `definition.function` → `function`. */
function kindOfDefinition(name: string): string {
  const parts = name.split('.')
  return parts[parts.length - 1] || 'unknown'
}

/** ¿El texto parece un identificador (y no un bloque entero)? */
function looksLikeIdentifier(text: string): boolean {
  return text.length > 0 && text.length <= 200 && !/[\n\r]/.test(text)
}

interface MutableSymbol {
  name: string
  kind: string
  capture: RawCapture
}

/**
 * Capturas de `tags.scm` → símbolos anidados.
 *
 * Dos caminos, porque las dos convenciones existen en la vida real:
 *  - hay capturas `@name` → el nombre es el texto de esa captura;
 *  - no hay `@name` → el nombre es el texto del propio `@definition.X` (la
 *    gramática capturó el identificador directamente, como hace el `.scm` de
 *    JavaScript de nvim).
 *
 * El anidado es por CONTENCIÓN de rangos (no por profundidad del árbol): así un
 * método queda dentro de su clase sin que la query lo diga. Un símbolo que
 * contiene a otro lo adopta como hijo, y los rangos del padre se estiran para
 * cubrir a los hijos (que es lo que el outline espera para el plegado).
 */
export function buildSymbols(captures: RawCapture[], text: string): DynamicSymbolNode[] {
  const starts = lineStarts(text)
  const definitions = captures.filter((capture) => capture.name.startsWith('definition.'))
  if (definitions.length === 0) return []

  const names = captures.filter((capture) => capture.name === 'name')
  const found: MutableSymbol[] = []

  if (names.length > 0) {
    // Camino A: cada `@name` pertenece a la definición más interna que lo
    // contiene (si no lo contiene ninguna, el `@name` no es de un símbolo).
    for (const name of names) {
      let owner: RawCapture | null = null
      for (const definition of definitions) {
        if (!contains(definition, name)) continue
        if (!owner || contains(owner, definition)) owner = definition
      }
      if (!owner) continue
      const label = textOf(name, text)
      if (label.length === 0) continue
      found.push({ name: label, kind: kindOfDefinition(owner.name), capture: owner })
    }
  } else {
    // Camino B: el capture de definición ES el nombre.
    for (const definition of definitions) {
      const label = textOf(definition, text)
      if (!looksLikeIdentifier(label)) continue
      found.push({ name: label, kind: kindOfDefinition(definition.name), capture: definition })
    }
  }

  if (found.length === 0) return []

  // Orden por posición y, a igual inicio, el rango MÁS GRANDE primero (el que
  // contiene va antes; así el apilado de abajo ve al padre antes que al hijo).
  const ordered = [...found].sort(
    (a, b) => a.capture.start - b.capture.start || b.capture.end - a.capture.end
  )

  const roots: Array<{ symbol: DynamicSymbolNode; capture: RawCapture }> = []
  const stack: Array<{ symbol: DynamicSymbolNode; capture: RawCapture }> = []

  for (const entry of ordered) {
    // Se desapila lo que ya terminó o lo que no contiene a esta captura.
    while (stack.length > 0 && !contains(stack[stack.length - 1].capture, entry.capture)) {
      stack.pop()
    }
    const range = rangeOf(entry.capture, starts)
    const node: DynamicSymbolNode = {
      name: entry.name,
      kind: entry.kind,
      line: range.startLine,
      column: range.startColumn,
      endLine: range.endLine,
      endColumn: range.endColumn,
      children: []
    }
    const parent = stack[stack.length - 1]
    if (parent) {
      parent.symbol.children.push(node)
      // El padre termina donde termina el hijo si el hijo se sale del rango
      // del padre: la definición de una función suele excluir su comentario
      // doc, y el outline tiene que cubrirlo para plegarse bien.
      if (range.endLine > parent.symbol.endLine) {
        parent.symbol.endLine = range.endLine
        parent.symbol.endColumn = range.endColumn
      }
    } else {
      roots.push({ symbol: node, capture: entry.capture })
    }
    stack.push({ symbol: node, capture: entry.capture })
  }

  return roots.map((entry) => entry.symbol)
}

// ── Plegado (folds.scm) ───────────────────────────────────────────────────

/** Kind de plegado: el sufijo del capture (`fold.comment` → `comment`). */
function foldKind(name: string, properties: Record<string, string | null>): string {
  const suffix = suffixOf(name, 'fold.')
  if (suffix) return suffix
  const fromProps =
    properties['fold.kind'] ?? properties['fold'] ?? null
  return fromProps && fromProps.length > 0 ? fromProps : 'region'
}

/**
 * Capturas de `folds.scm` → rangos plegables.
 *
 * Un rango de una sola línea no se pliega (no oculta nada) y se descarta: la
 * query captura el nodo COMPLETO, y para una función de una línea eso es una
 * sola línea.
 */
export function buildFoldRanges(
  matches: RawMatch[],
  text: string
): DynamicFoldRange[] {
  const starts = lineStarts(text)
  const byStart = new Map<number, DynamicFoldRange>()

  for (const match of matches) {
    for (const capture of match.captures) {
      if (capture.name !== 'fold' && !capture.name.startsWith('fold.')) continue
      const range = rangeOf(capture, starts)
      if (range.endLine <= range.startLine) continue
      const kind = foldKind(capture.name, { ...match.properties, ...(capture.properties ?? {}) })
      const existing = byStart.get(range.startLine)
      // Si dos queries capturan la MISMA línea de inicio (pasa cuando una
      // captura el bloque entero y otra su cabecera), gana el más grande: es lo
      // que hace el editor — plegar la línea de arriba esconde el bloque
      // completo, no sólo su encabezado.
      if (existing && existing.endLine >= range.endLine) continue
      byStart.set(range.startLine, { startLine: range.startLine, endLine: range.endLine, kind })
    }
  }

  return [...byStart.values()].sort((a, b) => a.startLine - b.startLine)
}

// ── Indentación (indents.scm) ─────────────────────────────────────────────

/**
 * Capturas de `indents.scm` → nivel de indentación por LÍNEA.
 *
 * nvim declara `@indent.begin` (bloque que indenta), `@indent.end` (dónde
 * termina), `@indent.dedent` y `@indent.branch` (el `case`/`else` que se alinea).
 * El nivel de cada línea es el de la anterior + bloques abiertos − cerrados.
 * Se devuelve una entrada EXTRA para la "línea virtual" siguiente a la última:
 * es la que usa el motor al apretar Enter al final del archivo.
 */
export function buildIndentLevels(matches: RawMatch[], text: string): number[] {
  const starts = lineStarts(text)
  const lineCount = starts.length
  const openAt = new Map<number, number>()
  const closeAt = new Map<number, number>()
  const dedentAt = new Map<number, number>()

  for (const match of matches) {
    for (const capture of match.captures) {
      const name = capture.name
      const range = rangeOf(capture, starts)
      if (name === 'indent.begin' || name.startsWith('indent.begin.')) {
        openAt.set(range.startLine, (openAt.get(range.startLine) ?? 0) + 1)
      } else if (name === 'indent.end' || name.startsWith('indent.end.')) {
        closeAt.set(range.endLine, (closeAt.get(range.endLine) ?? 0) + 1)
      } else if (
        name === 'indent.dedent' ||
        name.startsWith('indent.dedent.') ||
        name === 'indent.branch'
      ) {
        dedentAt.set(range.startLine, (dedentAt.get(range.startLine) ?? 0) + 1)
      }
    }
  }

  const levels: number[] = []
  let level = 0
  for (let line = 0; line <= lineCount; line += 1) {
    // Cierres y dedents aplican a ESTA línea (el `}` se alinea con su bloque).
    level = Math.max(0, level - (closeAt.get(line) ?? 0) - (dedentAt.get(line) ?? 0))
    levels.push(level)
    // Lo que abre en esta línea indenta las SIGUIENTES.
    level += openAt.get(line) ?? 0
  }
  return levels
}

// ── Inyecciones (injections.scm) ──────────────────────────────────────────

/** Propiedad booleana de un match: `injection.combined` (valor `null`). */
function isTruthy(value: string | null | undefined): boolean {
  if (value === null) return true
  if (value === undefined) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '' || normalized === 'true' || normalized === '1'
}

/**
 * Matches de `injections.scm` → tramos que pertenecen a otro lenguaje.
 *
 * El lenguaje puede venir de tres lugares, en este orden: la propiedad del
 * match/capture (`#set! injection.language "js"`), un capture
 * `@injection.language` (cuyo TEXTO es el lenguaje: es el caso de los
 * heredocs) o el nombre del capture con sufijo `.language`.
 */
export function buildInjectionRanges(
  matches: RawMatch[],
  text: string
): DynamicInjectionRange[] {
  const starts = lineStarts(text)
  const out: DynamicInjectionRange[] = []

  for (const match of matches) {
    const content = match.captures.filter((capture) => capture.name === 'injection.content')
    if (content.length === 0) continue

    let language: string | null = null
    let combined = false
    for (const capture of match.captures) {
      const props = { ...match.properties, ...(capture.properties ?? {}) }
      const declared = props['injection.language'] ?? props['injection.language.name'] ?? null
      if (declared && declared.length > 0) language = declared
      const languageCapture = suffixOf(capture.name, 'injection.language')
      if (languageCapture) language = languageCapture
      if (capture.name === 'injection.language') {
        const value = textOf(capture, text).trim()
        if (value.length > 0) language = value
      }
      if (isTruthy(props['injection.combined'])) combined = true
    }
    if (isTruthy(match.properties['injection.combined'])) combined = true

    // Sin lenguaje declarado no hay a qué lenguaje re-tokenizar el tramo. La
    // gramática igual lo marcó como contenido ajeno: se reporta el rango sin
    // lenguaje no se puede (el tipo lo exige), así que se descarta y el tramo
    // se queda con el color del lenguaje raíz.
    if (!language) continue

    const range = rangeOf(content[0], starts)
    out.push({
      startLine: range.startLine,
      startColumn: range.startColumn,
      endLine: range.endLine,
      endColumn: range.endColumn,
      language: language.trim(),
      combined
    })
  }

  return out.sort(
    (a, b) =>
      a.startLine - b.startLine ||
      a.startColumn - b.startColumn ||
      b.endLine - a.endLine
  )
}

// ── Locales (locals.scm) ──────────────────────────────────────────────────

/**
 * Capturas de `locals.scm` → definiciones y referencias con su alcance.
 *
 * El NOMBRE de una definición sale, en orden: un `@name` adentro del match de
 * la definición, el texto del propio capture si es un identificador, o el
 * último segmento del texto si no. Las referencias son siempre el texto del
 * capture (una referencia es el uso: su texto ES el nombre).
 *
 * El `scope` es el `@local.scope` más chico que contiene a la entrada. Es lo
 * que permite resolver una referencia contra la definición más cercana en vez
 * de contra la primera del archivo con el mismo nombre.
 */
export function buildLocalEntries(captures: RawCapture[], text: string): DynamicLocalEntry[] {
  const starts = lineStarts(text)
  const scopes = captures.filter((capture) => capture.name === 'local.scope')
  const names = captures.filter((capture) => capture.name === 'name')

  const scopeOf = (capture: RawCapture): DynamicLocalEntry['scope'] => {
    let inner: RawCapture | null = null
    for (const scope of scopes) {
      if (!contains(scope, capture)) continue
      if (!inner || contains(inner, scope)) inner = scope
    }
    if (inner) return rangeOf(inner, starts)
    // Sin `@local.scope` en la query, el archivo entero es el alcance. Es
    // correcto para gramáticas que no declaran scopes: la resolución queda a
    // nivel de archivo, que es mejor que no resolver nada.
    return null
  }

  const out: DynamicLocalEntry[] = []
  for (const capture of captures) {
    const isDefinition = capture.name.startsWith('local.definition')
    const isReference = capture.name.startsWith('local.reference')
    if (!isDefinition && !isReference) continue

    const own = textOf(capture, text)
    let name = ''
    if (isDefinition) {
      // `@name` DENTRO de la definición: la captura de la definición suele ser
      // el nodo entero (`function_declaration`) y el nombre está en su hijo.
      const inner = names.find((candidate) => contains(capture, candidate))
      name = inner ? textOf(inner, text) : own
      // Un `@local.definition` sobre un bloque completo no tiene un nombre: se
      // recorta a la primera línea para no meter un bloque entero en el índice.
      if (name.includes('\n')) name = name.split('\n')[0].trim()
    } else {
      name = own
    }
    name = name.trim()
    if (name.length === 0 || name.length > 200) continue

    const range = rangeOf(capture, starts)
    out.push({
      kind: isDefinition ? 'definition' : 'reference',
      name,
      line: range.startLine,
      column: range.startColumn,
      endLine: range.endLine,
      endColumn: range.endColumn,
      scope: scopeOf(capture)
    })
  }

  return out.sort((a, b) => a.line - b.line || a.column - b.column)
}

// ── Objetos de texto (textobjects.scm) ────────────────────────────────────

const TEXT_OBJECT_SUFFIXES = ['.inner', '.outer']

/**
 * Sufijos equivalentes de otras fuentes. nvim escribe `.inner`/`.outer`; Helix
 * —y el propio repo del parser de swift— escriben `.inside`/`.around`. Se
 * normalizan al vocabulario de nvim para que "expandir selección" funcione
 * igual con datos de cualquiera de las dos.
 */
const TEXT_OBJECT_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['.inside', '.inner'],
  ['.around', '.outer']
]

/** Nombre canónico del objeto (`function.inside` → `function.inner`), o null. */
function canonicalTextObjectName(name: string): string | null {
  for (const [alias, canonical] of TEXT_OBJECT_ALIASES) {
    if (name.endsWith(alias)) return `${name.slice(0, -alias.length)}${canonical}`
  }
  return TEXT_OBJECT_SUFFIXES.some((suffix) => name.endsWith(suffix)) ? name : null
}

/**
 * Capturas de `textobjects.scm` → rangos seleccionables.
 *
 * Se aceptan las dos convenciones vivas: el nombre con sufijo
 * (`function.inner`) y el prefijo explícito (`textobject.function.outer`). El
 * `.outer` incluye delimitadores y el `.inner` no: la diferencia es lo que
 * hace que "expandir selección" pueda crecer en dos pasos.
 */
export function buildTextObjects(captures: RawCapture[], text: string): DynamicTextObject[] {
  const starts = lineStarts(text)
  const out: DynamicTextObject[] = []

  for (const capture of captures) {
    const explicit = suffixOf(capture.name, 'textobject.') ?? suffixOf(capture.name, 'textobj.')
    const name = explicit
      ? canonicalTextObjectName(explicit) ?? explicit
      : canonicalTextObjectName(capture.name)
    if (!name) continue
    const range = rangeOf(capture, starts)
    out.push({
      name,
      startLine: range.startLine,
      startColumn: range.startColumn,
      endLine: range.endLine,
      endColumn: range.endColumn
    })
  }

  return out.sort(
    (a, b) =>
      a.startLine - b.startLine ||
      a.startColumn - b.startColumn ||
      b.endLine - a.endLine
  )
}
