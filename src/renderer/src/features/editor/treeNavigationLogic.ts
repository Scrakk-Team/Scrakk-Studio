/**
 * Lógica PURA de la navegación por el árbol (ir a la definición / expandir).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTÁ SEPARADO DE `treeNavigation.ts`
 *
 * `treeNavigation.ts` es la parte que TOCA LA APP (lee el archivo activo, pide
 * el cursor, mueve el motor). Esto es lo que decide: qué palabra está bajo el
 * cursor y A QUÉ DEFINICIÓN apunta una referencia. Esa decisión es la que se
 * puede equivocar de forma silenciosa — salta al lugar equivocado y nadie se
 * entera — así que vive aparte y se testea con listas de definiciones escritas
 * a mano, sin necesitar un editor vivo.
 *
 * La resolución es la misma idea que la de un compilador: una referencia se
 * resuelve contra el ámbito MÁS CERCANO que la contiene. Sin ámbitos (una
 * gramática sin `@local.scope`) se cae a “la definición más cercana hacia
 * arriba”, que sigue siendo mejor que la primera del archivo.
 */

import type { DynamicLocalEntry, DynamicTextObject } from '@shared/extensions'
import type { DocumentSymbol } from '@services/symbolExtractor'

/** Rango de líneas/columnas (0-based, columnas UTF-16). */
export interface Span {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export function containsPosition(span: Span, line: number, col: number): boolean {
  if (line < span.startLine || line > span.endLine) return false
  if (line === span.startLine && col < span.startColumn) return false
  if (line === span.endLine && col > span.endColumn) return false
  return true
}

export function spansEqual(a: Span | null, b: Span | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.startLine === b.startLine &&
    a.startColumn === b.startColumn &&
    a.endLine === b.endLine &&
    a.endColumn === b.endColumn
  )
}

/** Tamaño comparable de un rango (para “el más chico que contiene”). */
export function spanSize(span: Span): number {
  return (span.endLine - span.startLine) * 100_000 + (span.endColumn - span.startColumn)
}

/**
 * Palabra bajo una posición.
 *
 * Los `.` y `:` NO son parte de la palabra a propósito: `foo.bar` tiene que
 * resolver `bar`. Los `_`, `$` y los dígitos sí (identificadores reales).
 *
 * Dos detalles que importan en la práctica:
 *  - el caret suele quedar JUSTO después de la palabra (`foo|`): si la posición
 *    cae en un carácter que no es de palabra, se mira el anterior, así F12 con
 *    el cursor al final del identificador sigue funcionando;
 *  - si tampoco el anterior es de palabra (estás en un espacio), no hay palabra
 *    y el llamador avisa en vez de resolver otra cosa.
 */
export function wordAt(text: string, line: number, col: number): string {
  const lines = text.split('\n')
  const target = lines[line]
  if (target === undefined) return ''
  const isWordChar = (ch: string): boolean => /[A-Za-z0-9_$]/.test(ch)
  const clamped = Math.min(Math.max(col, 0), target.length)
  const at = target[clamped] !== undefined && isWordChar(target[clamped]) ? clamped : clamped - 1
  if (at < 0 || !isWordChar(target[at])) return ''
  let start = at
  let end = at + 1
  while (start > 0 && isWordChar(target[start - 1])) start--
  while (end < target.length && isWordChar(target[end])) end++
  return target.slice(start, end)
}

/**
 * A qué definición apunta una referencia.
 *
 * Reglas, en orden (la primera que encuentra algo gana):
 *
 *  1. Una definición con el mismo nombre en el MISMO ámbito (`@local.scope`).
 *     Es el caso del parámetro local y el que grita cuando se hace con grep.
 *  2. Una definición con el mismo nombre dentro de un ámbito que CONTENGA al de
 *     la referencia (closure sobre una variable de afuera).
 *  3. La definición con el mismo nombre más cercana HACIA ARRIBA del cursor
 *     (típico de top-level: la función se declara antes de usarse).
 *  4. Cualquier definición con el mismo nombre (último recurso).
 *
 * Devuelve `null` cuando no hay NINGUNA definición con ese nombre: “no sé” es
 * una respuesta válida y el llamador decide (avisar o caer al LSP).
 */
/**
 * Entrada de `locals.scm` → rango comparable.
 *
 * El contrato compartido usa `line`/`column` para el inicio (es el mismo
 * esquema que el resto de las posiciones de la app); las funciones de aquí
 * trabajan con `startLine`/`startColumn`. Este adaptador es la frontera entre
 * los dos nombres, en UN solo lugar.
 */
function spanOf(entry: DynamicLocalEntry): Span {
  return {
    startLine: entry.line,
    startColumn: entry.column,
    endLine: entry.endLine,
    endColumn: entry.endColumn
  }
}

export function resolveDefinition(
  locals: DynamicLocalEntry[],
  name: string,
  position: { line: number; column: number }
): DynamicLocalEntry | null {  if (name.length === 0) return null
  const definitions = locals.filter((entry) => entry.kind === 'definition' && entry.name === name)
  if (definitions.length === 0) return null

  // La referencia más chica que contiene el cursor describe el uso real.
  const reference =
    locals
      .filter(
        (entry) =>
          entry.kind === 'reference' &&
          entry.name === name &&
          containsPosition(spanOf(entry), position.line, position.column)
      )
      .sort((a, b) => spanSize(spanOf(a)) - spanSize(spanOf(b)))[0] ?? null

  if (reference) {
    // 1. Mismo ámbito.
    const sameScope = definitions.find((entry) => spansEqual(entry.scope, reference.scope))
    if (sameScope) return sameScope
    // 2. Un ámbito que contiene al de la referencia (closure).
    const referenceScope = reference.scope
    if (referenceScope) {
      const enclosing = definitions
        .filter(
          (entry) =>
            entry.scope !== null &&
            containsPosition(
              entry.scope,
              referenceScope.startLine,
              referenceScope.startColumn
            ) &&
            !spansEqual(entry.scope, referenceScope)
        )
        .sort((a, b) => spanSize(a.scope!) - spanSize(b.scope!))[0]
      if (enclosing) return enclosing
    }
  }

  // 3. La más cercana hacia arriba.
  const above = definitions
    .filter((entry) => entry.line < position.line)
    .sort((a, b) => b.line - a.line)[0]
  // 4. Cualquiera.
  return above ?? definitions[0]
}

/**
 * El siguiente objeto de texto al que expandir, o `null` si no hay uno más
 * grande. Puro a propósito: “expandir” es una decisión, no un movimiento.
 */
export function nextTextObject(
  objects: DynamicTextObject[],
  anchorPoint: { line: number; column: number },
  previous: Span | null
): DynamicTextObject | null {
  const candidates = objects
    .filter((object) => containsPosition(object, anchorPoint.line, anchorPoint.column))
    .filter((object) => (previous ? spanSize(object) > spanSize(previous) : true))
    .sort((a, b) => spanSize(a) - spanSize(b))
  return candidates[0] ?? null
}

/** Aplana el árbol de símbolos (clases/funciones/métodos anidados). */
function flattenSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] {
  const out: DocumentSymbol[] = []
  const walk = (list: DocumentSymbol[]): void => {
    for (const symbol of list) {
      out.push(symbol)
      if (symbol.children && symbol.children.length > 0) walk(symbol.children)
    }
  }
  walk(symbols)
  return out
}

/**
 * A qué SÍMBOLO (clase/función/método/…) apunta un nombre, usando `tags.scm`.
 *
 * Es el respaldo del árbol cuando el lenguaje NO trae `locals.scm` (locals
 * resuelve ámbitos finos; los símbolos resuelven declaraciones):
 *  1. el símbolo que CONTIENE la posición (estás parado en su declaración),
 *  2. el más cercano HACIA ARRIBA del cursor (la clase/función ya declarada),
 *  3. cualquiera con ese nombre.
 */
export function resolveSymbolDefinition(
  symbols: DocumentSymbol[],
  name: string,
  position: { line: number; column: number }
): DocumentSymbol | null {
  if (name.length === 0) return null
  const matches = flattenSymbols(symbols).filter((symbol) => symbol.name === name)
  if (matches.length === 0) return null
  const containing = matches.find(
    (symbol) => symbol.line <= position.line && (symbol.endLine ?? symbol.line) >= position.line
  )
  if (containing) return containing
  const above = matches
    .filter((symbol) => symbol.line <= position.line)
    .sort((a, b) => b.line - a.line)[0]
  return above ?? matches[0]
}
