// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Notas — API pública.
 *
 * `store` es el CRUD + config (lo usa el panel del usuario); `ai` es la puerta
 * acotada por permisos que debe usar la IA. Ambos viven acá para que cualquier
 * módulo los importe desde un solo lugar (`@services/notes`).
 */

export {
  listNotes,
  listVisibleNotes,
  getNote,
  subscribeToNotes,
  createNote,
  updateNote,
  patchNote,
  setNoteConfig,
  deleteNote,
  noteTitle,
  DEFAULT_NOTE_AI,
  _resetNotesForTests,
  type Note,
  type NoteScope,
  type NoteAiAccess,
  type NoteFilter,
  type NotePatch,
  type CreateNoteOptions,
  type NotesListener
} from './store'

export {
  aiVisibleNotes,
  aiListNotes,
  aiReadNote,
  aiCreateNote,
  aiUpdateNote,
  aiDeleteNote,
  type NoteSummary,
  type NoteAiCreateInput,
  type NoteAiNoteResult,
  type NoteAiResult
} from './ai'
