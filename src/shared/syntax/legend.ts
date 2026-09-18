/**
 * Leyenda de tokens — el puente entre "lo que el host resuelve" y "lo que el
 * motor pinta".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA QUE RESUELVE
 *
 * El motor recibe tokens de color como un array de enteros con el formato
 * delta del LSP (5 enteros por token: deltaLine, deltaStartChar, length,
 * `tokenType`, tokenModifiers) y traduce `tokenType` a un campo del tema.
 *
 * `tokenType` es un índice en la LEYENDA — y hay dos leyendas en juego:
 *
 *   1. la del LSP (spec estándar: 0 = namespace, 1 = type, … 21 = operator),
 *      que es la que manda el servidor de lenguaje;
 *   2. la del editor (los "slots" del tema: 0 = keyword, 1 = string, …),
 *      que es la que el host usa para pintar tokens propios (una gramática
 *      TextMate, un árbol tree-sitter dinámico).
 *
 * El motor traduce leyenda → slot (`SyntaxHighlighter::LspTokenTypeToSlot`).
 * Entonces el host NUNCA manda slots: manda índices de leyenda. Este archivo
 * es la única definición de esa traducción del lado TS, con tests, para que
 * las dos puntas no se separen en silencio (un slot desalineado no rompe
 * nada: pinta un color plausible y equivocado, que es lo peor).
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  resolveScopeStyle,
  SOURCE_PRIORITY,
  type ScopeRule,
  type ScopeStack,
  type SyntaxSource
} from './scopes'

/** Leyenda estándar del LSP, más un extra propio al final (ver `tag`). */
export const LEGEND = {
  namespace: 0,
  type: 1,
  class: 2,
  enum: 3,
  interface: 4,
  struct: 5,
  typeParameter: 6,
  parameter: 7,
  variable: 8,
  property: 9,
  enumMember: 10,
  event: 11,
  function: 12,
  method: 13,
  macro: 14,
  keyword: 15,
  modifier: 16,
  comment: 17,
  string: 18,
  number: 19,
  regexp: 20,
  operator: 21,
  decorator: 22,
  /**
   * `tag` NO está en la leyenda del LSP. Se agrega acá porque el tema del
   * editor tiene un color propio para etiquetas HTML/XML y sin esta entrada
   * una gramática TextMate no tendría forma de pedirlo (caería en `class`,
   * que en el tema es el color de tipos — incorrecto en `<div>`).
   */
  tag: 23
} as const

export type LegendName = keyof typeof LEGEND

/** Nombre del campo del tema por slot (documental: el motor no lo usa). */
export const SLOT_NAMES: readonly string[] = [
  'keyword', // 0
  'string', // 1
  'number', // 2
  'comment', // 3
  'function', // 4
  'variable', // 5
  'type', // 6
  'operator', // 7
  'punctuation', // 8
  'property', // 9
  'class', // 10
  'constant', // 11
  'parameter', // 12
  'tag', // 13
  'attribute' // 14
]

/**
 * Leyenda → slot. ESPEJO de `SyntaxHighlighter::LspTokenTypeToSlot` (C++).
 *
 * Si cambiás uno, cambiá el otro: el test `syntax-legend.test.ts` verifica que
 * la tabla sea coherente con `SLOT_TO_LEGEND`, pero no puede leer C++ — por eso
 * el espejo se documenta en los dos lados y este comentario es el contrato.
 */
export const LEGEND_TO_SLOT: Record<number, number> = {
  [LEGEND.namespace]: 6,
  [LEGEND.type]: 6,
  [LEGEND.class]: 10,
  [LEGEND.enum]: 10,
  [LEGEND.interface]: 10,
  [LEGEND.struct]: 10,
  [LEGEND.typeParameter]: 6,
  [LEGEND.parameter]: 12,
  [LEGEND.variable]: 5,
  [LEGEND.property]: 9,
  [LEGEND.enumMember]: 11,
  [LEGEND.event]: 9,
  [LEGEND.function]: 4,
  [LEGEND.method]: 4,
  [LEGEND.macro]: 4,
  [LEGEND.keyword]: 0,
  [LEGEND.modifier]: 0,
  [LEGEND.comment]: 3,
  [LEGEND.string]: 1,
  [LEGEND.number]: 2,
  [LEGEND.regexp]: 1,
  [LEGEND.operator]: 7,
  [LEGEND.decorator]: 14,
  [LEGEND.tag]: 13
}

/** Cuántas entradas tiene la leyenda estándar (el motor hace `% 23`). */
export const STANDARD_LEGEND_SIZE = 23

/** `0xffffffff` como "sin leyenda": el motor pinta el texto por defecto. */
export const SLOT_DEFAULT = 5

/** Leyenda → slot, con la misma tolerancia que el motor (módulo). */
export function slotForLegend(legend: number): number {
  if (!Number.isFinite(legend) || legend < 0) return SLOT_DEFAULT
  const direct = LEGEND_TO_SLOT[legend]
  if (direct !== undefined) return direct
  // Leyenda larga de un servidor que declara más tipos que la estándar: se
  // reusa la estándar en vez de caer a "variable" (que se ve sin color).
  const wrapped = legend % STANDARD_LEGEND_SIZE
  return LEGEND_TO_SLOT[wrapped] ?? SLOT_DEFAULT
}

/**
 * Slot → leyenda. Un slot puede tener varias leyendas (el 6 sale de `type`,
 * `namespace` y `typeParameter`): acá se elige la canónica para que el
 * round-trip leyenda→slot→leyenda no cambie de color.
 */
export const SLOT_TO_LEGEND: Record<number, number> = {
  0: LEGEND.keyword,
  1: LEGEND.string,
  2: LEGEND.number,
  3: LEGEND.comment,
  4: LEGEND.function,
  5: LEGEND.variable,
  6: LEGEND.type,
  7: LEGEND.operator,
  9: LEGEND.property,
  10: LEGEND.class,
  11: LEGEND.enumMember,
  12: LEGEND.parameter,
  13: LEGEND.tag,
  14: LEGEND.decorator
}

export function legendForSlot(slot: number): number {
  return SLOT_TO_LEGEND[slot] ?? LEGEND.variable
}

/** Nombre de la leyenda por índice (inverso de `LEGEND`), precomputado. */
const LEGEND_NAMES_BY_INDEX: readonly string[] = (() => {
  const names: string[] = []
  for (const [name, index] of Object.entries(LEGEND)) names[index] = name
  return names
})()

/**
 * Índice de leyenda → nombre (`keyword`, `function`…).
 *
 * Lo usan los diagnósticos (panel de inspección, logs del LSP): un log que dice
 * "legend 15" no le sirve a nadie, y `slotForLegend` va en la otra dirección.
 */
export function legendName(legend: number): string {
  return LEGEND_NAMES_BY_INDEX[legend] ?? `legend ${legend}`
}

// ── Del scope al slot: la tabla por defecto ──────────────────────────────

/**
 * Reglas scope → slot para cuando NO hay un tema con `tokenColors` propio.
 *
 * Es el reemplazo del `MapCaptureColor()` del motor, pero del lado del host y
 * **en el mismo espacio de nombres para las dos fuentes**: un scope de TextMate
 * (`entity.name.function.js`) y un capture de tree-sitter (`@function.method`)
 * se resuelven con esta única tabla. El orden importa: `resolveScopeStyle` da
 * prioridad al score del selector, y a igual score a la regla de más abajo.
 *
 * Cuando el tema traiga sus propios `tokenColors`, esas reglas entran ANTES y
 * ganan por score (son más específicas), así que esta tabla queda como red de
 * seguridad — no como verdad.
 */
export const DEFAULT_SLOT_RULES: ScopeRule<number>[] = [
  // Muy específicas primero (más a la izquierda = menos específica para el
  // resolver, que prioriza por score y no por orden; el orden decide empates).
  { selector: 'comment', value: 3 },
  { selector: 'string', value: 1 },
  { selector: 'string.regexp, string.regex, regexp', value: 1 },
  { selector: 'constant.numeric, number, @number', value: 2 },
  { selector: 'constant.language, constant.character, constant', value: 11 },
  { selector: 'keyword.operator', value: 7 },
  { selector: 'keyword.control, keyword, storage', value: 0 },
  { selector: 'entity.name.function, support.function, function, method', value: 4 },
  { selector: 'entity.name.type, entity.name.class, support.type, support.class, type, class', value: 10 },
  { selector: 'entity.name.tag, tag', value: 13 },
  { selector: 'entity.other.attribute-name, attribute', value: 14 },
  { selector: 'variable.parameter, parameter', value: 12 },
  { selector: 'variable.other.property, meta.object-literal.key, property', value: 9 },
  { selector: 'constant.other.symbol, meta.definition.variable', value: 11 },
  { selector: 'variable, @variable', value: 5 },
  { selector: 'punctuation', value: 8 }
]

/**
 * Resuelve el slot de un stack de scopes.
 *
 * `additionalRules` va AL FINAL: `resolveScopeStyle` desempata a igual score
 * por orden de declaración, y las reglas de un tema declarado por el usuario
 * tienen que ganar en su propio selector (`comment` del tema pisa el `comment`
 * por defecto). Una regla por defecto MÁS específica (score mayor) sigue
 * ganando, que es la semántica de VS Code.
 */
export function resolveSlotForScopes(
  scopes: ScopeStack,
  additionalRules: ScopeRule<number>[] = []
): number {
  const resolved = resolveScopeStyle([...DEFAULT_SLOT_RULES, ...additionalRules], scopes)
  return resolved?.value ?? SLOT_DEFAULT
}

// ── El payload que come el motor ─────────────────────────────────────────

/** Un token ya resuelto, en coordenadas absolutas (0-based, UTF-16). */
export interface HostToken {
  line: number
  startChar: number
  length: number
  slot: number
}

/**
 * Tokens → array delta del LSP con índices de LEYENDA.
 *
 * El motor espera exactamente este formato (5 enteros por token, deltas
 * relativos como manda la spec) porque es el mismo camino que usa el LSP: un
 * solo decoder en C++ para las cuatro fuentes de color.
 *
 * Precondición que el motor asume y acá se garantiza: los tokens van
 * ordenados por (línea, columna) y no se solapan dentro de la línea. Un solape
 * no rompe el pintado (el motor pinta en orden), pero sí desordena los deltas,
 * así que se filtran los tokens inválidos y se ordena antes de codificar.
 */
export function encodeHostTokens(tokens: HostToken[]): number[] {
  const valid = tokens
    .filter(
      (token) =>
        Number.isFinite(token.line) &&
        Number.isFinite(token.startChar) &&
        Number.isFinite(token.length) &&
        token.line >= 0 &&
        token.startChar >= 0 &&
        token.length > 0
    )
    .sort((a, b) => (a.line !== b.line ? a.line - b.line : a.startChar - b.startChar))

  const out: number[] = []
  let lastLine = 0
  let lastStart = 0

  for (const token of valid) {
    const deltaLine = token.line - lastLine
    const deltaStart = deltaLine === 0 ? token.startChar - lastStart : token.startChar
    out.push(
      deltaLine,
      deltaStart,
      token.length,
      legendForSlot(token.slot),
      0 // tokenModifiers: los modificadores (bold/italic) van en el paint list
    )
    lastLine = token.line
    lastStart = token.startChar
  }

  return out
}

// ── Fusión de fuentes en UN solo payload ─────────────────────────────────

/**
 * Los tokens de color que produjo UNA fuente del host.
 *
 * El motor tiene UN canal de tokens (`SetInnertaSemanticTokens`), así que las
 * fuentes que corren del lado del host no pueden empujar por su cuenta: si lo
 * hicieran, la última en llegar borraría a la otra (el LSP y la gramática
 * TextMate de una extensión se pisarían entre sí). Se fusionan acá.
 */
export interface HostTokenSource {
  source: SyntaxSource
  tokens: HostToken[]
}

/**
 * Fusiona tokens de varias fuentes por prioridad (`SOURCE_PRIORITY`).
 *
 * Regla: en un rango donde dos fuentes declaran color, gana la de mayor
 * prioridad — el LSP sobre la gramática, la gramática sobre el árbol. Es la
 * misma regla del paint list (`mergeSpans`), pero sobre tokens ya resueltos:
 * acá no hay estilos que heredar, sólo un slot por rango.
 *
 * El algoritmo corta los rangos en los límites de todos los tokens y, en cada
 * tramo, elige la fuente de mayor prioridad (a igual prioridad, la que llegó
 * después en la lista: una extensión instalada después corrige a la anterior).
 */
export function mergeHostTokens(sources: HostTokenSource[]): HostToken[] {
  const byLine = new Map<number, Array<{ token: HostToken; priority: number; order: number }>>()
  let order = 0

  for (const group of sources) {
    const priority = SOURCE_PRIORITY[group.source] ?? 0
    for (const token of group.tokens) {
      if (token.length <= 0 || token.line < 0 || token.startChar < 0) continue
      const list = byLine.get(token.line) ?? []
      list.push({ token, priority, order: order++ })
      byLine.set(token.line, list)
    }
  }

  const out: HostToken[] = []
  for (const [line, entries] of byLine) {
    // Puntos de corte de la línea + el/los token(s) que cubren cada tramo.
    const cuts = new Set<number>()
    for (const entry of entries) {
      cuts.add(entry.token.startChar)
      cuts.add(entry.token.startChar + entry.token.length)
    }
    const points = [...cuts].sort((a, b) => a - b)

    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i]
      const end = points[i + 1]
      if (end <= start) continue

      let winner: { token: HostToken; priority: number; order: number } | null = null
      for (const entry of entries) {
        const tokenEnd = entry.token.startChar + entry.token.length
        if (entry.token.startChar <= start && end <= tokenEnd) {
          if (
            !winner ||
            entry.priority > winner.priority ||
            (entry.priority === winner.priority && entry.order > winner.order)
          ) {
            winner = entry
          }
        }
      }
      if (!winner) continue

      const merged: HostToken = { line, startChar: start, length: end - start, slot: winner.token.slot }
      const last = out[out.length - 1]
      // Tramo contiguo con el mismo slot y la misma línea → se fusiona.
      if (
        last &&
        last.line === merged.line &&
        last.slot === merged.slot &&
        last.startChar + last.length === merged.startChar
      ) {
        last.length += merged.length
      } else {
        out.push(merged)
      }
    }
  }

  return out.sort((a, b) => (a.line !== b.line ? a.line - b.line : a.startChar - b.startChar))
}

/** Inverso de `encodeHostTokens` — para tests, depuración y la UI de tokens. */
export function decodeHostTokens(data: number[] | undefined): HostToken[] {
  if (!data || data.length < 5) return []
  const out: HostToken[] = []
  let line = 0
  let start = 0

  for (let i = 0; i + 5 <= data.length; i += 5) {
    const deltaLine = data[i]
    const deltaStart = data[i + 1]
    const length = data[i + 2]
    const legend = data[i + 3]
    if (!Number.isFinite(deltaLine) || deltaLine < 0) break

    line += deltaLine
    start = deltaLine === 0 ? start + deltaStart : deltaStart
    out.push({ line, startChar: start, length, slot: slotForLegend(legend) })
  }

  return out
}
