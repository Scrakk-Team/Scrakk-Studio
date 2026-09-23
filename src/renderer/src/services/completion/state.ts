/**
 * Estado de la lista de sugerencias (autocompletado) — store singleton.
 *
 * El popup es 100 % FRONTEND (como el tooltip del hover o el menú contextual):
 * el motor no dibuja nada. Lo único que necesitamos del motor es DÓNDE está el
 * caret en pantalla, y eso se resuelve con `hitTest` (ver `caretRect.ts`).
 */

import type { InnertaModule } from '@features/editor/engines/innerta/InnertaEngine'

export interface CompletionItem {
  /** Server que lo propuso (el commit va dirigido a ese server). */
  serverName: string
  label: string
  /** LSP CompletionItemKind (1 texto … 25 typeParameter). */
  kind: number
  detail?: string
  documentation?: string
  /** Texto que se inserta al aceptar (reemplaza el prefijo tipeado). */
  insertText: string
  /** Texto con el que se filtra contra el prefijo. */
  filterText: string
  sortText?: string
}

/** Rect del caret en coords LOCALES del canvas (px). */
export interface CaretRect {
  x: number
  y: number
  /** Alto de línea: alto del popup anclado al caret. */
  height: number
}

export interface CompletionState {
  open: boolean
  items: CompletionItem[]
  selected: number
  rect: CaretRect | null
  /** Prefijo tipeado antes del caret (para reemplazarlo al aceptar). */
  prefix: string
  /** Path del archivo dueño del popup. */
  path: string | null
  /** Motor que abrió el popup (para el commit por teclado). */
  module: InnertaModule | null
}

const INITIAL: CompletionState = {
  open: false,
  items: [],
  selected: 0,
  rect: null,
  prefix: '',
  path: null,
  module: null
}

let state: CompletionState = INITIAL
const listeners = new Set<(state: CompletionState) => void>()

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(state)
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

export function getCompletionState(): CompletionState {
  return state
}

export function subscribeToCompletion(listener: (state: CompletionState) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function set(patch: Partial<CompletionState>): void {
  state = { ...state, ...patch }
  emit()
}

/** Abre (o actualiza) el popup con ítems ya normalizados. */
export function showCompletion(patch: {
  items: CompletionItem[]
  path: string
  prefix: string
  rect: CaretRect | null
  module: InnertaModule | null
}): void {
  set({
    open: patch.items.length > 0,
    items: patch.items,
    selected: 0,
    path: patch.path,
    prefix: patch.prefix,
    rect: patch.rect,
    module: patch.module
  })
}

/** Mueve la selección (con vuelta por los extremos). */
export function moveCompletion(delta: number): void {
  if (!state.open || state.items.length === 0) return
  const count = state.items.length
  const next = (state.selected + delta + count) % count
  if (next === state.selected) return
  set({ selected: next })
}

/** Selecciona por índice (hover del mouse). */
export function selectCompletion(index: number): void {
  if (!state.open) return
  if (index < 0 || index >= state.items.length || index === state.selected) return
  set({ selected: index })
}

/** Cierra el popup y limpia todo. */
export function closeCompletion(): void {
  if (!state.open && state.items.length === 0) return
  state = INITIAL
  emit()
}
