/**
 * Paint list: los spans que el editor pinta y cómo se combinan las fuentes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN SPAN NO ES "UN COLOR"
 *
 * Lo que se descubre mirando VS Code (`encodedTokenAttributes.ts`): el estilo
 * de un token es **UN número de 32 bits** —
 *
 *     bbbb bbbb ffff ffff fFFF FBTT LLLL LLLL
 *        bg(8)   fg(9)  style(4) B(1) type(2) lang(8)
 *
 * — y los semantic tokens reusan el MISMO entero con flags `SEMANTIC_USE_*`
 * en el byte de languageId. Eso significa que un token semántico **pisa sólo
 * lo que declara**: si dice "italic" y no dice color, conserva el color del
 * árbol. Es exactamente lo que hace falta aquí, porque tenemos 4 fuentes
 * apiladas sobre el mismo rango (ver `scopes.ts`).
 *
 * Entonces: cada fuente aporta spans, cada span declara ASPECTOS (los que
 * tiene), y `mergeSpans` los combina por prioridad de fuente dejando que el
 * de arriba pise sólo lo suyo. El resultado es un único paint list.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { SOURCE_PRIORITY, type SyntaxSource } from './scopes'
import type { SyntaxLayer } from './queries'

export interface Position {
  /** 0-based. */
  line: number
  /** 0-based, en unidades UTF-16 (como el LSP). */
  column: number
}

/** Aspectos pintables de un token. Los que están presentes son los que pisa. */
export interface TokenStyle {
  foreground?: string
  background?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
}

/** Un span de UNA fuente. */
export interface StyledSpan {
  start: Position
  end: Position
  style: TokenStyle
  source: SyntaxSource
  layer: SyntaxLayer
}

/** Un tramo del paint list final: estilo ya resuelto. */
export interface ResolvedSpan {
  start: Position
  end: Position
  style: TokenStyle
  /** La fuente que ganó en ese tramo. */
  source: SyntaxSource
  /** Todas las capas que aportaron algo aquí (texto, subrayado, fondo…). */
  layers: SyntaxLayer[]
}

export function comparePosition(a: Position, b: Position): number {
  if (a.line !== b.line) return a.line - b.line
  return a.column - b.column
}

function isValidSpan(span: StyledSpan): boolean {
  return (
    Number.isFinite(span.start.line) &&
    Number.isFinite(span.start.column) &&
    Number.isFinite(span.end.line) &&
    Number.isFinite(span.end.column) &&
    comparePosition(span.start, span.end) < 0
  )
}

/** Los aspectos que un span DECLARA (los presentes, no los `undefined`). */
export function declaredAspects(style: TokenStyle): (keyof TokenStyle)[] {
  return (Object.keys(style) as (keyof TokenStyle)[]).filter((key) => style[key] !== undefined)
}

/**
 * Aplica `top` sobre `base`: sólo los aspectos que `top` declara.
 *
 * Es la regla de `SEMANTIC_USE_*` de VS Code, pero generalizada a cualquier
 * fuente (un árbol puede aportar el color y el LSP sólo la negrita).
 */
export function inheritStyle(base: TokenStyle, top: TokenStyle): TokenStyle {
  const out: TokenStyle = { ...base }
  // El cast es porque `TokenStyle` mezcla string y boolean y TS no puede
  // asignar una unión de propiedades sin colapsar el tipo en `undefined`.
  const target = out as Record<string, string | boolean | undefined>
  const source = top as Record<string, string | boolean | undefined>
  for (const aspect of declaredAspects(top)) {
    target[aspect] = source[aspect]
  }
  return out
}

/**
 * Combina los spans de todas las fuentes en UN paint list.
 *
 * Algoritmo: se cortan los rangos en los puntos de corte de todos los spans
 * (barrido de límites), y en cada tramo elemental gana la fuente de mayor
 * prioridad — con los aspectos heredados de las de menor prioridad. A igual
 * prioridad gana el span que llegó después (una extensión instalada después
 * puede corregir a la anterior). Los tramos contiguos con el mismo estilo y
 * la misma fuente ganadora se fusionan.
 *
 * Complejidad O(n log n + n·k) con k = spans por tramo; para decenas de miles
 * de spans de un archivo grande el barrido sigue siendo de un solo pase.
 */
export function mergeSpans(spans: StyledSpan[]): ResolvedSpan[] {
  const valid = spans.filter(isValidSpan)
  if (valid.length === 0) return []

  // Índice de orden de llegada: es el desempate a igual prioridad.
  const order = new Map<StyledSpan, number>()
  valid.forEach((span, index) => order.set(span, index))

  // Puntos de corte (inicio y fin de cada span).
  const cuts = new Set<string>()
  const key = (p: Position): string => `${p.line}:${p.column}`
  for (const span of valid) {
    cuts.add(key(span.start))
    cuts.add(key(span.end))
  }
  const points = [...cuts]
    .map((raw) => {
      const [line, column] = raw.split(':')
      return { line: Number(line), column: Number(column) }
    })
    .sort(comparePosition)

  const out: ResolvedSpan[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]
    const end = points[i + 1]
    if (comparePosition(start, end) === 0) continue

    // Spans que cubren TODO este tramo elemental.
    const covering = valid.filter(
      (span) => comparePosition(span.start, start) <= 0 && comparePosition(end, span.end) <= 0
    )
    if (covering.length === 0) continue

    // Orden total: prioridad de fuente y, a igual prioridad, orden de llegada.
    // (La capa NO desempata: un subrayado y un color pueden convivir, y un
    // comparador que mire la capa deja de ser transitivo.)
    covering.sort((a, b) => {
      const byPriority = SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
      if (byPriority !== 0) return byPriority
      return (order.get(a) ?? 0) - (order.get(b) ?? 0)
    })

    let style: TokenStyle = {}
    const layers: SyntaxLayer[] = []
    for (const span of covering) {
      style = inheritStyle(style, span.style)
      if (!layers.includes(span.layer)) layers.push(span.layer)
    }

    const winner = covering[covering.length - 1]
    const last = out[out.length - 1]
    const sameStyle =
      last &&
      last.source === winner.source &&
      last.style.foreground === style.foreground &&
      last.style.background === style.background &&
      last.style.bold === style.bold &&
      last.style.italic === style.italic &&
      last.style.underline === style.underline &&
      last.style.strikethrough === style.strikethrough &&
      last.layers.length === layers.length &&
      last.layers.every((layer, index) => layer === layers[index])

    if (sameStyle && comparePosition(last.end, start) === 0) {
      last.end = { ...end }
    } else {
      out.push({ start: { ...start }, end: { ...end }, style, source: winner.source, layers })
    }
  }
  return out
}

// ── El encoding u32 de VS Code (el payload que el motor pinta) ─────────────

/** Máscaras y offsets del metadata de token, iguales a VS Code. */
export const MetadataConsts = {
  LANGUAGEID_MASK: 0b00000000_00000000_00000000_11111111,
  TOKEN_TYPE_MASK: 0b00000000_00000000_00000011_00000000,
  BALANCED_BRACKETS_MASK: 0b00000000_00000000_00000100_00000000,
  FONT_STYLE_MASK: 0b00000000_00000000_01111000_00000000,
  FOREGROUND_MASK: 0b00000000_11111111_10000000_00000000,
  BACKGROUND_MASK: 0b11111111_00000000_00000000_00000000,

  ITALIC: 1,
  BOLD: 2,
  UNDERLINE: 4,
  STRIKETHROUGH: 8,

  LANGUAGEID_OFFSET: 0,
  TOKEN_TYPE_OFFSET: 8,
  BALANCED_BRACKETS_OFFSET: 10,
  FONT_STYLE_OFFSET: 11,
  FOREGROUND_OFFSET: 15,
  BACKGROUND_OFFSET: 24
} as const

export interface EncodedTokenParts {
  languageId: number
  tokenType: number
  balancedBrackets: boolean
  /** Bits de fontStyle (1 italic, 2 bold, 4 underline, 8 strikethrough). */
  fontStyle: number
  /** Índice en la paleta de colores (0 = ninguno). */
  foreground: number
  background: number
}

export function fontStyleBits(style: TokenStyle): number {
  let bits = 0
  if (style.italic) bits |= MetadataConsts.ITALIC
  if (style.bold) bits |= MetadataConsts.BOLD
  if (style.underline) bits |= MetadataConsts.UNDERLINE
  if (style.strikethrough) bits |= MetadataConsts.STRIKETHROUGH
  return bits
}

/**
 * Codifica el estilo de un token en UN entero. Es el formato probado de VS
 * Code: el motor recibe un array de ints (nada de objetos por token) y puede
 * comparar/deduplicar estilos por igualdad de número.
 */
export function encodeTokenMetadata(parts: EncodedTokenParts): number {
  const metadata =
    (parts.languageId & 0xff) |
    ((parts.tokenType & 0b11) << MetadataConsts.TOKEN_TYPE_OFFSET) |
    ((parts.balancedBrackets ? 1 : 0) << MetadataConsts.BALANCED_BRACKETS_OFFSET) |
    ((parts.fontStyle & 0b1111) << MetadataConsts.FONT_STYLE_OFFSET) |
    ((parts.foreground & 0x1ff) << MetadataConsts.FOREGROUND_OFFSET) |
    ((parts.background & 0xff) << MetadataConsts.BACKGROUND_OFFSET)
  return metadata >>> 0
}

export function decodeTokenMetadata(metadata: number): EncodedTokenParts {
  return {
    languageId: (metadata & MetadataConsts.LANGUAGEID_MASK) >>> MetadataConsts.LANGUAGEID_OFFSET,
    tokenType: (metadata & MetadataConsts.TOKEN_TYPE_MASK) >>> MetadataConsts.TOKEN_TYPE_OFFSET,
    balancedBrackets: (metadata & MetadataConsts.BALANCED_BRACKETS_MASK) !== 0,
    fontStyle: (metadata & MetadataConsts.FONT_STYLE_MASK) >>> MetadataConsts.FONT_STYLE_OFFSET,
    foreground: (metadata & MetadataConsts.FOREGROUND_MASK) >>> MetadataConsts.FOREGROUND_OFFSET,
    background: (metadata & MetadataConsts.BACKGROUND_MASK) >>> MetadataConsts.BACKGROUND_OFFSET
  }
}

/**
 * Paleta: estilo → índice. El motor pinta por índice y el host puede mandar
 * colores arbitrarios (hoy el techo es 15 campos fijos del tema).
 */
export class StylePalette {
  private readonly byKey = new Map<string, number>()
  private readonly styles: TokenStyle[] = [{ }]

  /** Devuelve el índice estable del estilo (1..n; 0 = vacío). */
  intern(style: TokenStyle): number {
    const aspects = declaredAspects(style).sort()
    const key = `${aspects.map((a) => `${a}=${String(style[a])}`).join('|')}`
    if (aspects.length === 0) return 0
    const found = this.byKey.get(key)
    if (found !== undefined) return found
    const index = this.styles.length
    this.styles.push({ ...style })
    this.byKey.set(key, index)
    return index
  }

  at(index: number): TokenStyle | undefined {
    return this.styles[index]
  }

  get size(): number {
    return this.styles.length
  }

  toArray(): TokenStyle[] {
    return [...this.styles]
  }
}
