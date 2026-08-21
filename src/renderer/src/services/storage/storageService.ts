/**
 * StorageService — API de alto nivel para leer y escribir el estado persistente.
 *
 * Centraliza la lógica de defaults, validación básica y serialización.
 * Todos los accesos a localStorage desde la app deben pasar por aquí,
 * nunca directamente por lsGet/lsSet.
 */

import { lsGet, lsSet, lsRemove, lsClear } from './localStorage'
import { STORAGE_KEYS } from './schema'
import type { LayoutSlotsData } from './schema'
import type { EditorFileTab } from '@features/editor'
import type { EditorHighlightSource } from './schema'

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_LAYOUT_SLOTS: LayoutSlotsData = {
  left: 'explorer',
  center: 'welcome',
  right: 'chat',
}

// ── Validadores ─────────────────────────────────────────────────────────────

function isValidLayoutSlots(value: unknown): value is LayoutSlotsData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    ('left' in v) &&
    ('center' in v) &&
    ('right' in v)
  )
}

function isValidEditorFiles(value: unknown): value is EditorFileTab[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as EditorFileTab).path === 'string' &&
      typeof (item as EditorFileTab).name === 'string'
  )
}

// ── Layout ──────────────────────────────────────────────────────────────────

export function getPersistedLayoutSlots(): LayoutSlotsData {
  const raw = lsGet<LayoutSlotsData>(STORAGE_KEYS.LAYOUT_SLOTS)
  if (isValidLayoutSlots(raw)) {
    // El editor y la bienvenida son slots transitorios, no se deben persistir
    // como panel activo (se resuelven en runtime según los archivos abiertos).
    return {
      ...raw,
      center: raw.center === 'editor' ? 'welcome' : raw.center,
    }
  }
  return { ...DEFAULT_LAYOUT_SLOTS }
}

export function persistLayoutSlots(slots: LayoutSlotsData): void {
  lsSet(STORAGE_KEYS.LAYOUT_SLOTS, slots)
}

// ── Editor (open files + active path) ───────────────────────────────────────

export function getPersistedEditorOpenFiles(): EditorFileTab[] {
  const raw = lsGet<EditorFileTab[]>(STORAGE_KEYS.EDITOR_OPEN_FILES)
  return isValidEditorFiles(raw) ? raw : []
}

export function persistEditorOpenFiles(files: EditorFileTab[]): void {
  lsSet(STORAGE_KEYS.EDITOR_OPEN_FILES, files)
}

export function getPersistedEditorActivePath(): string | null {
  const raw = lsGet<string>(STORAGE_KEYS.EDITOR_ACTIVE_PATH)
  return typeof raw === 'string' ? raw : null
}

export function persistEditorActivePath(path: string | null): void {
  if (path === null) {
    lsRemove(STORAGE_KEYS.EDITOR_ACTIVE_PATH)
  } else {
    lsSet(STORAGE_KEYS.EDITOR_ACTIVE_PATH, path)
  }
}

// ── Utilidades globales ──────────────────────────────────────────────────────

/** Borra todo el estado persistido de la app. Útil en logout o reset. */

/** Fuente de resaltado del editor (treesitter | lsp). Default: treesitter. */
function isValidHighlightSource(value: unknown): value is EditorHighlightSource {
  return value === 'treesitter' || value === 'lsp'
}

export function getPersistedHighlightSource(): EditorHighlightSource {
  try {
    const raw = lsGet(STORAGE_KEYS.EDITOR_HIGHLIGHT_SOURCE)
    const parsed: unknown = typeof raw === 'string' && raw.length > 0 ? JSON.parse(raw) : undefined
    if (isValidHighlightSource(parsed)) return parsed
  } catch {
    // caer al default
  }
  return 'treesitter'
}

export function persistHighlightSource(source: EditorHighlightSource): void {
  lsSet(STORAGE_KEYS.EDITOR_HIGHLIGHT_SOURCE, JSON.stringify(source))
}

export function clearAllStorage(): void {
  lsClear()
}
