/**
 * Sintaxis dinámica por archivo — lo que el ÁRBOL sabe, además del color.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN STORE Y NO UN PARÁMETRO
 *
 * El parser dinámico (tree-sitter del paquete) corre en el proceso main y su
 * respuesta llega al puente del editor. Pero los consumidores NO son el editor:
 *
 *   - el panel **Outline** quiere los símbolos (`tags.scm`),
 *   - **Ir a la definición** quiere los alcances (`locals.scm`),
 *   - **Expandir selección** quiere los objetos de texto (`textobjects.scm`),
 *   - el motor quiere los rangos de plegado (`folds.scm`).
 *
 * Todos viven en features distintas y ninguno tiene por qué conocer al puente
 * de Innerta. Entonces el puente PUBLICA acá (una entrada por path) y cada
 * consumidor lee/escucha. Es el mismo patrón que `hostTokens` para el color,
 * pero para el resto del árbol.
 *
 * La entrada se tira al cerrar el archivo: un outline con los símbolos del
 * archivo anterior es peor que un outline vacío.
 */

import type {
  DynamicFoldRange,
  DynamicLocalEntry,
  DynamicSymbolNode,
  DynamicTextObject
} from '@shared/extensions'
import type { QueryCategory } from '@shared/syntax'
import type { DocumentSymbol, SymbolKind } from '@services/symbolExtractor'

export interface DynamicSyntaxEntry {
  /** Lenguaje que resolvió la extensión (`gleam`, `zig`…). */
  languageId: string
  /** Paquete dueño del parser (para la UI de inspección). */
  extensionId: string
  /** Símbolos ya en la forma del outline de la app. */
  symbols: DocumentSymbol[]
  folds: DynamicFoldRange[]
  locals: DynamicLocalEntry[]
  textObjects: DynamicTextObject[]
  /** Categorías que el worker aplicó de verdad (diagnóstico honesto). */
  appliedCategories: QueryCategory[]
  at: number
}

/** Kinds de `tags.scm` → kinds del outline. Lo que no está cae a `variable`. */
const SYMBOL_KINDS: Record<string, SymbolKind> = {
  module: 'module',
  namespace: 'namespace',
  package: 'package',
  class: 'class',
  method: 'method',
  property: 'property',
  field: 'field',
  enum: 'enum',
  interface: 'interface',
  function: 'function',
  variable: 'variable',
  constant: 'constant',
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  array: 'array',
  object: 'object',
  key: 'key',
  enumMember: 'enumMember',
  struct: 'struct',
  event: 'event',
  operator: 'operator',
  typeParameter: 'typeParameter',
  // Alias que usan varias gramáticas y que el outline no tiene propios.
  type: 'class',
  type_parameter: 'typeParameter',
  local: 'variable',
  parameter: 'variable',
  macro: 'function',
  rule: 'function',
  label: 'namespace',
  section: 'namespace',
  heading: 'namespace'
}

// `@definition.constructor` existe en varias gramáticas, pero TypeScript no
// acepta `constructor` como CLAVE literal dentro del `Record` (la trata como el
// constructor del prototipo y ensancha el valor a `string`, sin validarlo). Se
// agrega por índice, que sí pasa por el chequeo de tipo del valor.
SYMBOL_KINDS['constructor'] = 'constructor'

/** Nodo del árbol → símbolo del outline (recursivo, con los hijos). */
export function toDocumentSymbol(node: DynamicSymbolNode): DocumentSymbol {
  const children = node.children.map(toDocumentSymbol)
  return {
    name: node.name,
    kind: SYMBOL_KINDS[node.kind] ?? 'variable',
    line: node.line,
    endLine: node.endLine,
    children: children.length > 0 ? children : undefined
  }
}

/** Todo un nivel del árbol → la lista que come el panel. */
export function toDocumentSymbols(nodes: DynamicSymbolNode[]): DocumentSymbol[] {
  return nodes.map(toDocumentSymbol)
}

// ── Store ─────────────────────────────────────────────────────────────────

const entries = new Map<string, DynamicSyntaxEntry>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

/** Publica (o reemplaza) la sintaxis dinámica de un archivo. */
export function publishDynamicSyntax(path: string, entry: DynamicSyntaxEntry): void {
  entries.set(path, entry)
  emit()
}

/** Lo del archivo, o `null` si su lenguaje no tiene parser dinámico. */
export function getDynamicSyntax(path: string | null | undefined): DynamicSyntaxEntry | null {
  if (!path) return null
  return entries.get(path) ?? null
}

/** El archivo se cerró: se tira lo suyo. */
export function clearDynamicSyntax(path: string): void {
  if (entries.delete(path)) emit()
}

/** Solo el marcador de cambio (los consumidores leen el snapshot). */
export function subscribeToDynamicSyntax(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Para tests: estado limpio. */
export function _resetDynamicSyntaxForTests(): void {
  entries.clear()
  listeners.clear()
}
