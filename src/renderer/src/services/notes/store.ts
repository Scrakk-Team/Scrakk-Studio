/**
 * Notas — store central (CRUD + subscribe + persistencia).
 *
 * La app usa ESTA MISMA API: el NotePanel lista/edita y el header crea.
 * Persistencia en localStorage (`scrakk-studio:notes`); sin storage, memoria.
 */

export interface Note {
  id: string
  content: string
  createdAt: number
  updatedAt: number
}

export type NotesListener = () => void

const NOTES_KEY = 'scrakk-studio:notes'

/** Título derivado: primera línea no vacía, o fallback. */
export function noteTitle(content: string): string {
  const line = content.split('\n').map((l) => l.trim()).find((l) => l.length > 0)
  return line ?? 'Sin título'
}

function readStorage(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(NOTES_KEY)
  } catch {
    return null
  }
}

function writeStorage(value: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(NOTES_KEY, value)
  } catch {
    // Sin almacenamiento: queda en memoria.
  }
}

let seq = 0
let cached: Note[] | null = null
let memoryFallback: Note[] = []
const listeners = new Set<NotesListener>()

function load(): Note[] {
  if (cached) return cached
  const raw = readStorage()
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        cached = (parsed as unknown[])
          .filter(
            (n): n is Note =>
              typeof n === 'object' &&
              n !== null &&
              typeof (n as Note).id === 'string' &&
              typeof (n as Note).content === 'string'
          )
          .map((n) => ({
            id: n.id,
            content: n.content,
            createdAt: typeof n.createdAt === 'number' ? n.createdAt : 0,
            updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : 0
          }))
        return cached
      }
    } catch {
      // JSON corrupto: se arranca vacío.
    }
  }
  cached = [...memoryFallback]
  return cached
}

function persist(): void {
  const list = cached ?? []
  memoryFallback = [...list]
  writeStorage(JSON.stringify(list))
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

/** Notas ordenadas por actualización (nuevas primero). Copia. */
export function listNotes(): Note[] {
  return [...load()].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
}

export function getNote(id: string): Note | null {
  return load().find((n) => n.id === id) ?? null
}

export function subscribeToNotes(listener: NotesListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Crea una nota vacía y la devuelve. */
export function createNote(): Note {
  const now = Date.now()
  const note: Note = { id: `note-${now}-${++seq}`, content: '', createdAt: now, updatedAt: now }
  cached = [note, ...load()]
  persist()
  emit()
  return note
}

/** Actualiza el contenido (y updatedAt). Null si no existe. */
export function updateNote(id: string, content: string): Note | null {
  const list = load()
  const index = list.findIndex((n) => n.id === id)
  if (index === -1) return null
  const next: Note = { ...list[index], content, updatedAt: Date.now() }
  cached = [...list.slice(0, index), next, ...list.slice(index + 1)]
  persist()
  emit()
  return next
}

/** Elimina una nota. False si no existía. */
export function deleteNote(id: string): boolean {
  const list = load()
  if (!list.some((n) => n.id === id)) return false
  cached = list.filter((n) => n.id !== id)
  persist()
  emit()
  return true
}

/** Solo tests: resetea memoria + storage + listeners. */
export function _resetNotesForTests(): void {
  cached = []
  memoryFallback = []
  listeners.clear()
  writeStorage(JSON.stringify([]))
}
