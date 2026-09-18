/**
 * Decoraciones de editor (REALES, en memoria por extensión).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ ES
 *
 * `window.createTextEditorDecorationType(...)` + `editor.setDecorations(tipo,
 * rangos)` es el API con el que una extensión pinta DENTRO del texto: subrayar
 * los `TODO`, marcar un import sin usar, resaltar coincidencias, marcar
 * conflictos de Git. Antes esto era INERTE (avisaba una vez "las decoraciones
 * todavía no se pintan" y devolvía un objeto vacío): la extensión quedaba
 * activa, sin error, y no se veía nada.
 *
 * Ahora el tipo se PARSEA (la cadena «CSS» de VS Code → estilo + color del
 * motor), los rangos se guardan por archivo y el host EMPUJA el estado a la UI,
 * que lo dibuja con el mismo canal de subrayados que los diagnósticos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EL PARSEO VIVE ACÁ (y no en la UI)
 *
 * Es el mismo motivo que la severidad de los diagnósticos: la traducción es
 * Node puro y se testea sin levantar el IDE. El renderer recibe DATOS
 * (estilo + color + rango), no una cadena que tenga que volver a interpretar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * No conoce Electron: recibe un `push` (el puente del host) y guarda rangos.
 * Si Owear cambia el transporte, cambia el `push`, no esto.
 */

import type { ExtensionDecorationsPayload, HostDecoration } from '@shared/extensionHost/protocol'
import { EventEmitter, Uri } from './vscodeShim'

/** Lo que el motor sabe dibujar (mismo orden que `DrawHostUnderline`, C++). */
const STYLE_CODES: Record<DecorationStyleName, number> = {
  wavy: 0,
  underline: 1,
  dotted: 2,
  double: 3
}

export type DecorationStyleName = 'wavy' | 'underline' | 'dotted' | 'double'

/** Estilo + color ya resueltos de un tipo de decoración. */
export interface DecorationSpec {
  style: number
  /** 0xRRGGBBAA, o `undefined` si la extensión no fijó color (el tema decide). */
  color?: number
}

/** Objeto que devuelve `createTextEditorDecorationType`. */
export interface DecorationTypeHandle {
  key: string
  dispose(): void
}

/**
 * Cadena de decoración de VS Code → estilo del motor.
 *
 * VS Code acepta `'underline'`, `'underline wavy red'`, `'dotted #ff0000'`…
 * El orden de las palabras no importa: se buscan las que conocemos y se ignora
 * el resto (una extensión puede meter `overline` o `line-through`, que el motor
 * no dibuja, sin que eso rompa el subrayado).
 */
export function parseDecorationStyle(text: string | undefined): number {
  const value = (text ?? '').toLowerCase()
  if (value.includes('wavy') || value.includes('squiggly')) return STYLE_CODES.wavy
  if (value.includes('dotted')) return STYLE_CODES.dotted
  if (value.includes('double')) return STYLE_CODES.double
  return STYLE_CODES.underline
}

/**
 * Color CSS → 0xRRGGBBAA.
 *
 * Acepta `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` y los NOMBRES que
 * más se usan (una decoración «underline wavy red» es lo más común que hay).
 * Devuelve `undefined` si no se pudo leer: el que decide es el tema, no un
 * fallback inventado acá.
 */
export function parseDecorationColor(input: string | undefined): number | undefined {
  if (!input) return undefined
  let value = input.trim().toLowerCase()
  if (value.length === 0) return undefined

  const named: Record<string, string> = {
    red: '#ff0000',
    orange: '#ffa500',
    yellow: '#ffff00',
    green: '#00ff00',
    blue: '#0000ff',
    purple: '#a020f0',
    white: '#ffffff',
    black: '#000000',
    gray: '#808080',
    grey: '#808080'
  }
  if (named[value]) value = named[value]

  if (value.startsWith('#')) {
    const hex = value.slice(1)
    if (/^[0-9a-f]{3}$/.test(hex)) {
      const expanded = hex
        .split('')
        .map((char) => char + char)
        .join('')
      return ((parseInt(expanded, 16) << 8) | 0xff) >>> 0
    }
    if (/^[0-9a-f]{6}$/.test(hex)) return ((parseInt(hex, 16) << 8) | 0xff) >>> 0
    if (/^[0-9a-f]{8}$/.test(hex)) return parseInt(hex, 16) >>> 0
    return undefined
  }

  const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(value)
  if (!match) return undefined
  const channel = (raw: string): number => Math.max(0, Math.min(255, Math.round(Number(raw))))
  const alpha =
    match[4] === undefined
      ? 255
      : match[4].endsWith('%')
        ? channel(String((parseFloat(match[4]) / 100) * 255))
        : channel(String(parseFloat(match[4]) * 255))
  const r = channel(match[1])
  const g = channel(match[2])
  const b = channel(match[3])
  return (((r << 24) | (g << 16) | (b << 8) | alpha) >>> 0) as number
}

/**
 * Opciones de VS Code → spec del motor.
 *
 * Se aceptan las DOS formas que hay en circulación:
 *  - nueva: `{ textEditorDecorationType: 'underline wavy red' }`,
 *  - clásica: `{ textDecoration: 'underline', color: '#f00' }` /
 *    `{ overviewRulerColor: '#f00' }` (el color del texto es el que se usa
 *    cuando no hay `textDecoration` con color propio).
 */
export function parseDecorationSpec(options: unknown): DecorationSpec {
  const model = (options ?? {}) as Record<string, unknown>
  const raw =
    typeof model.textEditorDecorationType === 'string'
      ? model.textEditorDecorationType
      : typeof model.textDecoration === 'string'
        ? model.textDecoration
        : ''
  const style = parseDecorationStyle(raw)
  // El color explícito gana; si no, el que venga DENTRO de la cadena.
  const explicit =
    typeof model.color === 'string'
      ? model.color
      : typeof model.overviewRulerColor === 'string'
        ? model.overviewRulerColor
        : undefined
  const color = parseDecorationColor(explicit) ?? parseDecorationColor(colorWordOf(raw))
  return color === undefined ? { style } : { style, color }
}

/** Palabra de color dentro de una cadena de decoración (`underline wavy red`). */
function colorWordOf(text: string): string | undefined {
  for (const word of text.split(/\s+/)) {
    if (word.startsWith('#') || word.startsWith('rgb')) return word
    if (/^(red|orange|yellow|green|blue|purple|white|black|gray|grey)$/.test(word)) return word
  }
  return undefined
}

/** `hoverMessage` (string | MarkdownString | array) → texto plano. */
function hoverToText(hover: unknown): string | undefined {
  if (typeof hover === 'string') return hover
  if (Array.isArray(hover)) {
    const parts = hover.map(hoverToText).filter((part): part is string => Boolean(part))
    return parts.length > 0 ? parts.join('\n\n') : undefined
  }
  if (hover && typeof hover === 'object') {
    const value = (hover as { value?: unknown }).value
    if (typeof value === 'string') return value
  }
  return undefined
}

/** Un `Range` de VS Code (o un `DecorationOptions`) → rango serializable. */
export function toHostDecoration(
  rangeOrOptions: unknown,
  spec: DecorationSpec
): HostDecoration | null {
  const model = (rangeOrOptions ?? {}) as Record<string, unknown>
  const range = (model.range ?? model) as {
    start?: { line?: unknown; character?: unknown }
    end?: { line?: unknown; character?: unknown }
  }
  const startLine = Number(range?.start?.line)
  const startCol = Number(range?.start?.character)
  const endLine = Number(range?.end?.line)
  const endCol = Number(range?.end?.character)
  if (![startLine, startCol, endLine, endCol].every(Number.isFinite)) return null
  const decoration: HostDecoration = {
    startLine: Math.max(0, Math.floor(startLine)),
    startCol: Math.max(0, Math.floor(startCol)),
    endLine: Math.max(0, Math.floor(endLine)),
    endCol: Math.max(0, Math.floor(endCol)),
    style: spec.style
  }
  if (spec.color !== undefined) decoration.color = spec.color
  const message = hoverToText((model as { hoverMessage?: unknown }).hoverMessage)
  if (message) decoration.message = message
  return decoration
}

/** Opciones que la extensión puede leer del tipo que creó. */
export interface DecorationTypeOptions {
  [key: string]: unknown
}

/**
 * Registro vivo de decoraciones de UNA extensión.
 *
 * El estado es por (tipo, archivo): llamar de nuevo `setDecorations` con el
 * mismo tipo REEMPLAZA (como VS Code), y con una lista vacía limpia. El empuje
 * a la UI es un snapshot completo de los archivos TOCADOS —los que quedaron sin
 * rangos van con `[]`, que es lo que borra el subrayado; omitirlos lo dejaría
 * pintado para siempre.
 */
export class EditorDecorationsRegistry {
  /** key del tipo → spec + rangos por archivo. */
  private readonly types = new Map<string, { spec: DecorationSpec; byPath: Map<string, HostDecoration[]> }>()
  /** Archivos tocados alguna vez (para mandar los `[]` de limpieza). */
  private readonly touchedPaths = new Set<string>()
  private seq = 0
  readonly onDidChangeDecorations = new EventEmitter<void>()

  constructor(private readonly push: (payload: ExtensionDecorationsPayload) => void) {}

  createType(options?: DecorationTypeOptions): DecorationTypeHandle {
    const key = `ext-decoration-${++this.seq}`
    this.types.set(key, { spec: parseDecorationSpec(options), byPath: new Map() })
    return {
      key,
      dispose: () => this.disposeType(key)
    }
  }

  /** `editor.setDecorations(tipo, rangos | opciones[])`. Reemplaza, no acumula. */
  setDecorations(path: string, type: unknown, ranges: unknown): void {
    const key =
      typeof type === 'string'
        ? type
        : typeof (type as { key?: unknown } | undefined)?.key === 'string'
          ? ((type as { key: string }).key)
          : undefined
    if (!path || typeof key !== 'string') return
    const entry = this.types.get(key)
    if (!entry) return
    const list = Array.isArray(ranges) ? ranges : []
    const converted: HostDecoration[] = []
    for (const range of list) {
      const decoration = toHostDecoration(range, entry.spec)
      if (decoration) converted.push(decoration)
    }
    this.touchedPaths.add(path)
    if (converted.length === 0) entry.byPath.delete(path)
    else entry.byPath.set(path, converted)
    this.flush()
  }

  /** El tipo se tiró (`dispose()` o desactivación): sus rangos se van con él. */
  disposeType(key: string): void {
    if (!this.types.delete(key)) return
    this.flush()
  }

  /** Snapshot crudo (tests y diagnóstico): archivo → rangos. */
  snapshot(): Array<{ path: string; decorations: HostDecoration[] }> {
    const byPath = new Map<string, HostDecoration[]>()
    for (const path of this.touchedPaths) byPath.set(path, [])
    for (const entry of this.types.values()) {
      for (const [path, decorations] of entry.byPath) {
        const bucket = byPath.get(path) ?? []
        bucket.push(...decorations)
        byPath.set(path, bucket)
      }
    }
    return [...byPath.entries()].map(([path, decorations]) => ({ path, decorations }))
  }

  /** La extensión se apagó: todo vacío (la UI borra sus subrayados). */
  disposeAll(): void {
    this.types.clear()
    this.flush()
  }

  private flush(): void {
    this.push({ entries: this.snapshot() })
    this.onDidChangeDecorations.fire()
  }
}

/** Ruta con la que la UI identifica el recurso (misma regla que diagnósticos). */
export function decorationPath(uri: Uri): string {
  return uri.scheme === 'file' ? uri.fsPath : uri.toString()
}
