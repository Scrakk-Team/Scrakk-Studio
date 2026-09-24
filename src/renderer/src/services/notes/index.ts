// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Notas — API pública.
 */

export {
  listNotes,
  getNote,
  subscribeToNotes,
  createNote,
  updateNote,
  deleteNote,
  noteTitle,
  _resetNotesForTests,
  type Note,
  type NotesListener
} from './store'
