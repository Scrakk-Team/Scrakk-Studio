/**
 * Controlador de la lista de sugerencias.
 *
 * Flujo: el input del editor avisa "se tipeó algo" → acá se pide
 * `textDocument/completion` al server del archivo, se normaliza y se muestra en
 * el popup (que es DOM puro). Aceptar reemplaza el prefijo tipeado usando el
 * CAMINO DE TECLADO del motor (Backspace + chars), así se conserva el undo y
 * los auto-pairs del lenguaje.
 *
 * Nada de esto toca el motor: el ancla del caret sale de `caretCanvasRect`.
 */

import type { InnertaModule } from '@features/editor/engines/innerta/InnertaEngine'
import { lspCompletion, type TaggedCompletionItem } from '@services/lsp'
import { caretCanvasRect } from './caretRect'
import {
  closeCompletion,
  getCompletionState,
  moveCompletion,
  showCompletion,
  type CompletionItem
} from './state'

/** GLFW_KEY_BACKSPACE (ver `CODE_TO_GLFW` en innertaInput). */
const GLFW_BACKSPACE = 259
/** Debounce del pedido: tecleo rápido no dispara N requests. */
const DEBOUNCE_MS = 70
/** Caracteres de palabra que forman el prefijo a reemplazar. */
const WORD_TAIL = /[A-Za-z0-9_$]*$/

export interface CompletionRequest {
  module: InnertaModule | null
  canvas: HTMLCanvasElement | null
  path: string | null
}

let requestSeq = 0
let timer: ReturnType<typeof setTimeout> | undefined

/** Prefijo tipeado antes del caret (lo que el commit va a reemplazar). */
export function prefixAt(text: string, line: number, col: number): string {
  if (!text) return ''
  const lines = text.split('\n')
  const lineText = lines[line] ?? ''
  const before = lineText.slice(0, Math.max(0, col))
  const match = WORD_TAIL.exec(before)
  return match ? match[0] : ''
}

/** Texto de documentación del protocolo (string | MarkupContent) → texto. */
function documentationText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value?: unknown }).value
    return typeof inner === 'string' ? inner : undefined
  }
  return undefined
}

/** CompletionItem del protocolo → ítem normalizado del popup. */
function toItem(tagged: TaggedCompletionItem): CompletionItem {
  const item = tagged.item as Record<string, unknown>
  const edit = item.textEdit as { newText?: string } | undefined
  const label = String(item.label ?? '')
  return {
    serverName: tagged.serverName,
    label,
    kind: Number(item.kind ?? 1),
    detail: typeof item.detail === 'string' ? item.detail : undefined,
    documentation: documentationText(item.documentation),
    insertText: String(item.insertText ?? edit?.newText ?? label),
    filterText: String(item.filterText ?? label),
    sortText: typeof item.sortText === 'string' ? item.sortText : undefined
  }
}

/** Filtra por prefijo (case-insensitive) y ordena; si nada matchea, no filtra. */
export function rankItems(items: CompletionItem[], prefix: string): CompletionItem[] {
  const seen = new Set<string>()
  const unique: CompletionItem[] = []
  for (const item of items) {
    // Mismo símbolo propuesto por dos servers (p. ej. tsserver + eslint) se
    // muestra UNA vez: gana el primero (el routing ya los ordena por prioridad).
    const key = `${item.label}:${item.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }

  const lower = prefix.toLowerCase()
  const matches = lower
    ? unique.filter((item) => item.filterText.toLowerCase().startsWith(lower))
    : unique
  const pool = matches.length > 0 || !lower ? matches : unique

  return pool
    .sort((a, b) => {
      const bySort = (a.sortText ?? a.label).localeCompare(b.sortText ?? b.label)
      return bySort !== 0 ? bySort : a.label.localeCompare(b.label)
    })
    .slice(0, 200)
}

/** Pide sugerencias YA (Ctrl+Space) y abre el popup. */
export async function requestCompletion({ module, canvas, path }: CompletionRequest): Promise<void> {
  if (!module || !path || typeof module.getCursor !== 'function') return
  const cursor = module.getCursor()
  if (!cursor || cursor.line < 0) return

  const seq = ++requestSeq
  const text = module.getText?.() ?? ''
  const prefix = prefixAt(text, cursor.line, cursor.col)
  // El popup es DOM: pasar la posición del caret a coords de CLIENTE.
  const local = caretCanvasRect(module, canvas)
  const canvasBox = canvas?.getBoundingClientRect()
  const rect =
    local && canvasBox
      ? { x: local.x + canvasBox.left, y: local.y + canvasBox.top, height: local.height }
      : null

  const raw = await lspCompletion(path, cursor.line, cursor.col)
  if (seq !== requestSeq) return // llegó tarde: ya se pidió otra cosa

  // El caret se movió mientras esperábamos: no anclar el popup donde no va.
  const now = module.getCursor?.()
  if (!now || now.line !== cursor.line || now.col !== cursor.col) return

  const items = rankItems(raw.map(toItem), prefix)
  if (items.length === 0) {
    closeCompletion()
    return
  }
  showCompletion({ items, path, prefix, rect, module })
}

/** Pide con debounce (para tecleo). */
export function scheduleCompletion(request: CompletionRequest): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = undefined
    void requestCompletion(request)
  }, DEBOUNCE_MS)
}

/** Cancela un pedido pendiente y cierra el popup. */
export function closeCompletionPopup(): void {
  if (timer) clearTimeout(timer)
  timer = undefined
  requestSeq++ // invalida cualquier respuesta en vuelo
  closeCompletion()
}

export function isCompletionOpen(): boolean {
  return getCompletionState().open
}

/**
 * Acepta el ítem seleccionado.
 *
 * Reemplaza el prefijo con `insertText` por el camino del teclado del motor:
 * Backspace × prefijo + un `char` por carácter. Es lo que conserva el undo y
 * respeta el auto-pairing del lenguaje (a diferencia de reescribir el buffer).
 */
export function acceptCompletion(module: InnertaModule | null): boolean {
  const state = getCompletionState()
  const item = state.items[state.selected]
  if (!state.open || !item || !module) {
    closeCompletionPopup()
    return false
  }
  for (let i = 0; i < state.prefix.length; i++) {
    module.key(GLFW_BACKSPACE, 1, 0)
  }
  for (const char of item.insertText) {
    module.char(char.codePointAt(0) ?? 0)
  }
  closeCompletionPopup()
  return true
}

/**
 * Tecla con el popup abierto. Devuelve `true` si la consumimos (el motor NO la
 * ve) y `false` si debe seguir su camino normal (y el popup se cierra cuando
 * corresponde).
 */
export function handleCompletionKey(event: KeyboardEvent, module: InnertaModule | null): boolean {
  if (!isCompletionOpen()) return false
  switch (event.key) {
    case 'Escape':
      closeCompletionPopup()
      return true
    case 'ArrowDown':
      moveCompletion(1)
      return true
    case 'ArrowUp':
      moveCompletion(-1)
      return true
    case 'Enter':
    case 'Tab':
      return acceptCompletion(module)
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'Home':
    case 'End':
      // Se mueve el caret: el popup deja de corresponder a esa posición.
      closeCompletionPopup()
      return false
    default:
      return false
  }
}
