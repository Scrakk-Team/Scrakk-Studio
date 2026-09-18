/**
 * Bookmarks — marcadores de línea por archivo.
 *
 * El RENDERER es la fuente de verdad (persistido en storage); el engine
 * Innerta solo RECIBE la lista (SetInnertaBookmarks) para dibujar el proicon
 * bookmark en el gutter. Patrón idéntico al toggle de minimap: store +
 * broadcast por CustomEvent + suscripción.
 */

import { lsGet, lsSet } from '@services/storage'

export const BOOKMARKS_EVENT = 'scrakk-bookmarks-changed'
const STORAGE_KEY = 'scrakk-studio:bookmarks'

type Listener = () => void

let data: Record<string, number[]> = {}
const listeners = new Set<Listener>()

function load(): void {
  const stored = lsGet<Record<string, number[]>>(STORAGE_KEY)
  data = stored && typeof stored === 'object' ? stored : {}
}

function persist(): void {
  lsSet(STORAGE_KEY, data)
  emit()
  window.dispatchEvent(new CustomEvent(BOOKMARKS_EVENT))
}

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

load()

/** Copia de los bookmarks de UN archivo (0-based, ordenados). */
export function getBookmarksForPath(path: string): number[] {
  return [...(data[path] ?? [])]
}

/** Todos los bookmarks con líneas ordenadas (para el panel). */
export function getAllBookmarks(): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const [path, lines] of Object.entries(data)) {
    if (lines.length > 0) out[path] = [...lines].sort((a, b) => a - b)
  }
  return out
}

/** Alta/baja directa desde el engine (click en el gutter) — espeja su set. */
export function applyEngineBookmark(path: string, line: number, on: boolean): void {
  const current = new Set(data[path] ?? [])
  if (on) current.add(line)
  else current.delete(line)
  if (current.size === 0) delete data[path]
  else data[path] = [...current]
  persist()
}

/** Alterna un bookmark; devuelve el estado resultante. */
export function toggleBookmark(path: string, line: number): boolean {
  const current = new Set(data[path] ?? [])
  const next = !current.has(line)
  if (next) current.add(line)
  else current.delete(line)
  if (current.size === 0) delete data[path]
  else data[path] = [...current]
  persist()
  return next
}

export function setBookmarksForPath(path: string, lines: number[]): void {
  const unique = [...new Set(lines)].sort((a, b) => a - b)
  if (unique.length === 0) delete data[path]
  else data[path] = unique
  persist()
}

export function subscribeToBookmarks(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Solo tests: resetea memoria + listeners. */
export function _resetBookmarksForTests(): void {
  data = {}
  listeners.clear()
}
