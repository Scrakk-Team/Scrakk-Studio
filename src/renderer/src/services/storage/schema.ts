/**
 * Schema del almacenamiento persistente de BorealChat.
 *
 * Cada interfaz describe la forma de los datos asociados a una clave.
 * Añadir una nueva clave persistida = agregar aquí su tipo y la constante
 * STORAGE_KEYS correspondiente.
 *
 * Versión: si una clave cambia su forma en el futuro, incrementar su versión
 * aquí y manejar la migración en storageService.ts.
 */

import type { PanelId, SlotId } from '@features/layout'
import type { EditorFileTab } from '@features/editor'

// ── Claves del storage ──────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  /** Distribución de paneles por slot. */
  LAYOUT_SLOTS: 'layout.slots',

  /** Lista de archivos abiertos en el editor. */
  EDITOR_OPEN_FILES: 'editor.openFiles',

  /** Ruta del archivo activo. */
  EDITOR_ACTIVE_PATH: 'editor.activePath',

  /** Fuente de resaltado del editor Innerta (elección del usuario). */
  EDITOR_HIGHLIGHT_SOURCE: 'editor.highlightSource',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

// ── Formas de cada clave ────────────────────────────────────────────────────

export type LayoutSlotsData = Record<SlotId, PanelId | null>

export interface EditorSessionData {
  openFiles: EditorFileTab[]
  activePath: string | null
}

/**
 * Elección del usuario para el resaltado del editor:
 *  - 'treesitter': resaltado local por gramáticas (default).
 *  - 'lsp': semantic tokens guiados por el language server (más preciso,
 *    requiere server con capability semanticTokensProvider).
 */
export type EditorHighlightSource = 'treesitter' | 'lsp'

// ── Mapa tipado de clave → tipo de valor ────────────────────────────────────

export interface StorageSchema {
  [STORAGE_KEYS.LAYOUT_SLOTS]: LayoutSlotsData
  [STORAGE_KEYS.EDITOR_OPEN_FILES]: EditorFileTab[]
  [STORAGE_KEYS.EDITOR_ACTIVE_PATH]: string | null
  [STORAGE_KEYS.EDITOR_HIGHLIGHT_SOURCE]: EditorHighlightSource
}
