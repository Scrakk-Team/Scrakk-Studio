// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Notas — store central (CRUD + config + subscribe + persistencia).
 *
 * La app usa ESTA MISMA API: el NotePanel lista/edita/configura, el header crea,
 * y el tool `notes` de la IA (`services/notes/ai.ts`) lee/escribe a través de
 * acá. Persistencia en localStorage (`scrakk-studio:notes`); sin storage, en
 * memoria.
 *
 * Modelo:
 *  - `scope`: la nota es `global` (aparece en todos los proyectos) o `project`
 *    (sólo en el proyecto dueño, `projectRoot`).
 *  - `ai`: qué puede hacer la IA con ESA nota (`read`/`edit`/`delete`).
 */

import { t } from '@core/i18n'

/** Dónde vive la nota. */
export type NoteScope = 'global' | 'project'

/** Qué puede hacer la IA con una nota. Deny-by-default donde importa. */
export interface NoteAiAccess {
  /** Puede listarla y leer su contenido. */
  read: boolean
  /** Puede reescribir su contenido. */
  edit: boolean
  /** Puede borrarla. */
  delete: boolean
}

export interface Note {
  id: string
  content: string
  scope: NoteScope
  /** Root del proyecto dueño. Presente sólo cuando `scope === 'project'`. */
  projectRoot?: string
  ai: NoteAiAccess
  createdAt: number
  updatedAt: number
}

/** Defaults de una nota nueva: la IA puede leer/editar, borrar lo decide el usuario. */
export const DEFAULT_NOTE_AI: NoteAiAccess = { read: true, edit: true, delete: false }

export interface NoteFilter {
  /** `all` (default) = todas; si no, sólo las del scope. */
  scope?: NoteScope | 'all'
  /** Al filtrar `project`, limita al dueño. */
  projectRoot?: string | null
}

export interface CreateNoteOptions {
  content?: string
  scope?: NoteScope
  projectRoot?: string | null
  ai?: Partial<NoteAiAccess>
}

/** Campos que se pueden parchear de una nota. */
export interface NotePatch {
  content?: string
  scope?: NoteScope
  projectRoot?: string | null
  ai?: Partial<NoteAiAccess>
}

export type NotesListener = () => void

const NOTES_KEY = 'scrakk-studio:notes'

/** Título derivado: primera línea no vacía, o fallback. */
export function noteTitle(content: string): string {
  const line = content.split('\n').map((l) => l.trim()).find((l) => l.length > 0)
  return line ?? t('services.sin.titulo')
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

/** Normaliza una nota cruda (con migración de las viejas sin scope/ai). */
function normalizeNote(raw: unknown): Note | null {
  if (typeof raw !== 'object' || raw === null) return null
  const candidate = raw as Record<string, unknown>
  if (typeof candidate.id !== 'string' || typeof candidate.content !== 'string') return null

  const scope: NoteScope = candidate.scope === 'project' ? 'project' : 'global'
  const rawAi = (candidate.ai ?? {}) as Record<string, unknown>
  const note: Note = {
    id: candidate.id,
    content: candidate.content,
    scope,
    ai: {
      read: rawAi.read !== false,
      edit: rawAi.edit !== false,
      delete: rawAi.delete === true
    },
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : 0,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : 0
  }
  if (scope === 'project' && typeof candidate.projectRoot === 'string' && candidate.projectRoot) {
    note.projectRoot = candidate.projectRoot
  }
  return note
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
        cached = parsed
          .map(normalizeNote)
          .filter((n): n is Note => n !== null)
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

/** Orden: por actualización (nuevas primero). */
function byUpdated(a: Note, b: Note): number {
  return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt
}

/**
 * Notas ordenadas por actualización. Sin filtro devuelve TODAS; con filtro,
 * limita por scope (y por dueño cuando es `project`).
 */
export function listNotes(filter?: NoteFilter): Note[] {
  const all = [...load()].sort(byUpdated)
  if (!filter || !filter.scope || filter.scope === 'all') return all
  return all.filter(
    (n) =>
      n.scope === filter.scope &&
      (filter.scope !== 'project' ||
        filter.projectRoot == null ||
        n.projectRoot === filter.projectRoot)
  )
}

/**
 * Notas que corresponde VER en un proyecto: las `global` siempre, más las
 * `project` cuyo dueño es ese root. Es lo que usan el panel y la IA.
 */
export function listVisibleNotes(projectRoot: string | null | undefined): Note[] {
  return [...load()]
    .sort(byUpdated)
    .filter(
      (n) => n.scope === 'global' || (!!projectRoot && n.projectRoot === projectRoot)
    )
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

/** Crea una nota. Defaults: vacía, global, con los permisos de IA default. */
export function createNote(options: CreateNoteOptions = {}): Note {
  const now = Date.now()
  const scope: NoteScope = options.scope === 'project' ? 'project' : 'global'
  const note: Note = {
    id: `note-${now}-${++seq}`,
    content: options.content ?? '',
    scope,
    ai: { ...DEFAULT_NOTE_AI, ...(options.ai ?? {}) },
    createdAt: now,
    updatedAt: now
  }
  if (scope === 'project' && options.projectRoot) note.projectRoot = options.projectRoot
  cached = [note, ...load()]
  persist()
  emit()
  return note
}

/** Actualiza SOLO el contenido (compat). Null si no existe. */
export function updateNote(id: string, content: string): Note | null {
  return patchNote(id, { content })
}

/** Actualiza los campos que vengan en el patch (y `updatedAt`). */
export function patchNote(id: string, patch: NotePatch): Note | null {
  const list = load()
  const index = list.findIndex((n) => n.id === id)
  if (index === -1) return null
  const current = list[index]

  const scope: NoteScope =
    patch.scope === 'project' || patch.scope === 'global' ? patch.scope : current.scope
  const next: Note = {
    ...current,
    content: patch.content ?? current.content,
    scope,
    ai: { ...current.ai, ...(patch.ai ?? {}) },
    updatedAt: Date.now()
  }

  // `projectRoot`: se toma del patch si viene, si no se conserva el dueño previo.
  const projectRoot =
    patch.projectRoot !== undefined ? (patch.projectRoot ?? undefined) : current.projectRoot
  if (scope === 'project' && projectRoot) next.projectRoot = projectRoot
  else delete next.projectRoot

  cached = [...list.slice(0, index), next, ...list.slice(index + 1)]
  persist()
  emit()
  return next
}

/** Cambia scope/dueño y/o permisos de IA de una nota. */
export function setNoteConfig(
  id: string,
  config: { scope?: NoteScope; projectRoot?: string | null; ai?: Partial<NoteAiAccess> }
): Note | null {
  return patchNote(id, {
    scope: config.scope,
    projectRoot: config.projectRoot,
    ai: config.ai
  })
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
  seq = 0
  writeStorage(JSON.stringify([]))
}
