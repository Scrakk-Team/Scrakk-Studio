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
