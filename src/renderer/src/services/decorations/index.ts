/**
 * Decoraciones del editor — subrayado por RANGO, de varias fuentes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ ES
 *
 * El editor (Innerta, WASM) pinta texto, selección y caret. Todo lo que va
 * DENTRO del texto —el subrayado de un error, de un aviso o de una palabra
 * buscada— entra por el canal de decoraciones del motor
 * (`SetInnertaUnderlines`, sextupletes de ints: ver `docs/editor/decorations.md`).
 *
 * Este servicio es la ÚNICA puerta a ese canal. Nadie más habla con el motor:
 *
 *   LSP (diagnósticos)   ┐
 *   extensión del API    ├─→ este store ─→ cada engine Innerta vivo
 *   búsqueda, git, …     ┘    (por archivo, por fuente)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ MULTI-FUENTE (y no una lista sola)
 *
 * Es el mismo bug que tenía el panel de Problemas: con una lista por archivo,
 * el último que escribe pisa al otro. `tsc` publica y borra los del linter; el
 * linter publica y borra los de `tsc`. Acá cada fuente tiene su entrada y la
 * lectura AGREGA, así que una extensión y un language server conviven sobre la
 * misma línea (y se pueden apagar por separado).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Nada de acá conoce Electron: es un store en memoria + una lista de rangos.
 * Si Owear cambia el motor de render, se reescribe el puente que empuja los
 * sextupletes (hoy en `features/editor/engines/innerta`), no este archivo.
 */

import { colorToRgba } from '@features/editor/engines/innerta/innertaTheme'

/**
 * Estilo del trazo. Son los 4 que el motor dibuja hoy:
 * `wavy` (diagnóstico), `underline` (decoración normal de VS Code),
 * `dotted` (pista) y `double` (deprecación/import no usado).
 */
export type DecorationStyle = 'wavy' | 'underline' | 'dotted' | 'double'

/** Estilo → código del motor. El orden lo define `DrawHostUnderline` (C++). */
export const DECORATION_STYLE_CODES: Record<DecorationStyle, number> = {
  wavy: 0,
  underline: 1,
  dotted: 2,
  double: 3
}

/** Un tramo subrayado. Las líneas/columnas son 0-based (convención del puente). */
export interface EditorDecoration {
  startLine: number
  startCol: number
  endLine: number
  endCol: number
  /** Color 0xRRGGBBAA — el MISMO orden que el resto del puente Innerta. */
  color: number
  /** Por defecto `wavy`: es lo que espera un diagnóstico. */
  style?: DecorationStyle
  /**
   * Texto de la decoración (el mensaje del diagnóstico, el del linter…).
   * El MOTOR no lo ve: lo usa la UI (hover sobre el tramo).
   */
  message?: string
}

/** Código del motor → estilo (la vuelta de `DECORATION_STYLE_CODES`). */
export function decorationStyleFromCode(code: number | undefined): DecorationStyle {
  switch (code) {
    case 0:
      return 'wavy'
    case 1:
      return 'underline'
    case 2:
      return 'dotted'
    case 3:
      return 'double'
    default:
      return 'wavy'
  }
}

/**
 * Color por defecto de una decoración que no pidió ninguno.
 *
 * VS Code usa el color de decoración del tema; el IDE ya tiene una var para
 * "esto es informativo" y es la única razonable acá: inventar un azul propio
 * haría que el mismo subrayado se viera distinto según quién lo pidió.
 */
export const DEFAULT_DECORATION_COLOR_VAR = '--color-info'
export const DEFAULT_DECORATION_COLOR_FALLBACK = '#3794ff'

/**
 * Fila del payload del host (`editor.setDecorations` de una extensión) →
 * decoración del store.
 *
 * La traducción vive acá y no en el puente del Extension Host para que haya UNA
 * sola forma de convertir "estilo + color del motor" en decoración: si mañana
 * el LSP quiere mandar `straight`, no inventa otro camino.
 */
export function fromHostDecoration(input: {
  startLine: number
  startCol: number
  endLine: number
  endCol: number
  style?: number
  color?: number
  message?: string
}): EditorDecoration {
  const decoration: EditorDecoration = {
    startLine: input.startLine,
    startCol: input.startCol,
    endLine: input.endLine,
    endCol: input.endCol,
    color:
      typeof input.color === 'number'
        ? input.color
        : themeColor(DEFAULT_DECORATION_COLOR_VAR, DEFAULT_DECORATION_COLOR_FALLBACK),
    style: decorationStyleFromCode(input.style)
  }
  if (input.message) decoration.message = input.message
  return decoration
}

/** Una fuente = un consumidor identificable (`lsp`, `extension:pub.name`, …). */
const bySource = new Map<string, Map<string, EditorDecoration[]>>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no tumba a los demás.
    }
  }
}

/**
 * Velocidad de cambio: dos listas iguales NO emiten.
 *
 * Los servers repiten `publishDiagnostics` en cada keystroke y el editor tiene
 * N engines vivos (uno por tab): sin esto, cada repetición recorrería todos los
 * módulos WASM para volver a dibujar exactamente lo mismo.
 */
function sameDecorations(a: readonly EditorDecoration[], b: readonly EditorDecoration[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]
    const right = b[index]
    if (
      left.startLine !== right.startLine ||
      left.startCol !== right.startCol ||
      left.endLine !== right.endLine ||
      left.endCol !== right.endCol ||
      left.color !== right.color ||
      (left.style ?? 'wavy') !== (right.style ?? 'wavy') ||
      left.message !== right.message
    ) {
      return false
    }
  }
  return true
}

/**
 * Reemplaza las decoraciones de UNA fuente para UN archivo.
 *
 * Una lista vacía BORRA esa fuente (es lo que mandan los dos canales cuando el
 * problema desaparece). Los rangos invertidos o inconclusos se descartan acá y
 * no en el motor: el que conoce las coordenadas es el que las valida.
 *
 * OJO con un rango VACÍO (`start == end`): es legal en el LSP y lo usan servers
 * de verdad —el de CSS marca `} expected` con un rango de ancho CERO en la
 * posición donde falta la llave, y `semi-colon expected` igual—. Antes se
 * descartaba por "invertido" y el problema desaparecía en silencio: el panel lo
 * listaba y el editor no subrayaba nada. Se acepta y el ancho mínimo lo pone
 * `packDecorations` (el motor dibuja de 0 a 0 = nada).
 */
export function setDecorations(
  sourceId: string,
  path: string,
  decorations: readonly EditorDecoration[]
): void {
  if (!sourceId || !path) return
  const clean = decorations.filter(
    (entry) =>
      Number.isFinite(entry.startLine) &&
      Number.isFinite(entry.startCol) &&
      Number.isFinite(entry.endLine) &&
      Number.isFinite(entry.endCol) &&
      entry.endLine >= entry.startLine &&
      // VACÍO (`endCol === startCol` en la misma línea) es válido: el motor lo
      // dibuja con el ancho mínimo de `packDecorations`. Sólo se descarta lo
      // INVERTIDO de verdad (termina antes de empezar).
      (entry.endLine > entry.startLine || entry.endCol >= entry.startCol)
  )

  const existing = bySource.get(sourceId)
  const previous = existing?.get(path)
  if (previous && clean.length === 0) {
    existing!.delete(path)
    if (existing!.size === 0) bySource.delete(sourceId)
    emit()
    return
  }
  if (previous && sameDecorations(previous, clean)) return
  if (clean.length === 0) return

  const bucket = existing ?? new Map<string, EditorDecoration[]>()
  bucket.set(path, clean.map((entry) => ({ ...entry })))
  bySource.set(sourceId, bucket)
  emit()
}

/**
 * Baja las decoraciones de una fuente: de un archivo, o de todos.
 *
 * Se llama cuando la fuente deja de existir (una extensión se apaga, el LSP se
 * reinicia, el usuario limpia la búsqueda). Sin esto quedan subrayados de algo
 * que ya no corre — y el usuario no tiene forma de saber por qué.
 */
export function clearDecorations(sourceId: string, path?: string): void {
  const bucket = bySource.get(sourceId)
  if (!bucket) return
  if (path) {
    if (!bucket.delete(path)) return
    if (bucket.size === 0) bySource.delete(sourceId)
  } else {
    bySource.delete(sourceId)
  }
  emit()
}

/** Decoraciones de un archivo, de todas las fuentes (sin agrupar). */
export function getDecorations(path: string): EditorDecoration[] {
  const out: EditorDecoration[] = []
  for (const bucket of bySource.values()) {
    const list = bucket.get(path)
    if (list) out.push(...list)
  }
  return out
}

/** Fuentes con decoraciones en un archivo (diagnóstico y "apagar una fuente"). */
export function getDecorationSources(path: string): string[] {
  const out: string[] = []
  for (const [sourceId, bucket] of bySource.entries()) {
    if (bucket.has(path)) out.push(sourceId)
  }
  return out.sort()
}

/**
 * Decoraciones que CONTIENEN una posición (para el hover: el mensaje del
 * problema bajo el puntero). El final es exclusivo, como en el LSP.
 *
 * Un rango VACÍO cuenta como el carácter que se dibuja (`[start, start + 1)`):
 * es el mismo criterio con el que `packDecorations` le da ancho, así que el
 * hover cubre exactamente el tramo que el usuario ve subrayado.
 */
export function getDecorationsAt(path: string, line: number, col: number): EditorDecoration[] {
  return getDecorations(path).filter((entry) => {
    if (line < entry.startLine || line > entry.endLine) return false
    if (line === entry.startLine && col < entry.startCol) return false
    const end =
      entry.endLine === entry.startLine && entry.endCol <= entry.startCol
        ? entry.startCol + 1
        : entry.endCol
    if (line === entry.endLine && col > end) return false
    return true
  })
}

/**
 * Rangos → sextupletes `(startLine, startCol, endLine, endCol, rgba, style)`.
 *
 * Es el formato que espera `SetInnertaUnderlines` y se empaqueta ACÁ (y no en
 * cada llamador) a propósito: es la parte que se rompe en silencio si alguien
 * arma el array con otro orden.
 *
 * Un rango VACÍO se ensancha a UN carácter (`startCol + 1`): el motor dibuja de
 * columna a columna, así que 0 de ancho es 0 píxeles. Es el mismo criterio que
 * VS Code, que en una posición marca un tramo corto y no un hueco invisible
 * (el modelo del motor es monoespaciado: un carácter = un avance).
 */
export function packDecorations(decorations: readonly EditorDecoration[]): number[] {
  const out: number[] = []
  for (const entry of decorations) {
    const startLine = Math.max(0, Math.floor(entry.startLine))
    const startCol = Math.max(0, Math.floor(entry.startCol))
    const endLine = Math.max(0, Math.floor(entry.endLine))
    let endCol = Math.max(0, Math.floor(entry.endCol))
    if (endLine === startLine && endCol <= startCol) endCol = startCol + 1
    out.push(
      startLine,
      startCol,
      endLine,
      endCol,
      entry.color | 0,
      DECORATION_STYLE_CODES[entry.style ?? 'wavy'] ?? 0
    )
  }
  return out
}

export function subscribeToDecorations(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Color de un token de tema (`--color-danger`, …) → 0xRRGGBBAA. */
export function themeColor(cssVar: string, fallback: string): number {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
    return colorToRgba(value.length > 0 ? value : fallback)
  } catch {
    return colorToRgba(fallback)
  }
}

/** Solo tests: resetea memoria + listeners. */
export function _resetDecorationsStoreForTests(): void {
  bySource.clear()
  listeners.clear()
}
