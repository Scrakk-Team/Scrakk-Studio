// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del store de notas (CRUD + orden + títulos).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  listNotes,
  getNote,
  subscribeToNotes,
  createNote,
  updateNote,
  deleteNote,
  noteTitle,
  _resetNotesForTests
} from '../src/renderer/src/services/notes/store'

describe('notes — noteTitle', () => {
  it('primera línea no vacía o fallback', () => {
    expect(noteTitle('\n  Hola mundo\nsegunda')).toBe('Hola mundo')
    expect(noteTitle('   \n  ')).toBe('Sin título')
    expect(noteTitle('')).toBe('Sin título')
  })
})

describe('notes — store', () => {
  beforeEach(() => {
    _resetNotesForTests()
  })

  it('arranca vacío; crear devuelve nota seleccionable', () => {
    expect(listNotes()).toEqual([])
    const note = createNote()
    expect(note.id).toMatch(/^note-/)
    expect(getNote(note.id)?.content).toBe('')
  })

  it('update cambia contenido; delete elimina; get null si no existe', () => {
    const note = createNote()
    expect(updateNote(note.id, 'hola')?.content).toBe('hola')
    expect(updateNote('nope', 'x')).toBeNull()
    expect(deleteNote(note.id)).toBe(true)
    expect(deleteNote(note.id)).toBe(false)
    expect(getNote(note.id)).toBeNull()
  })

  it('lista ordenada por actualización (nuevas primero)', () => {
    // Reloj controlado: evita empates de Date.now() en el mismo ms.
    let now = 1000
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      const a = createNote() // t=1000
      now = 2000
      const b = createNote() // t=2000
      expect(listNotes().map((n) => n.id)).toEqual([b.id, a.id])
      now = 3000
      updateNote(a.id, 'tocada') // t=3000
      expect(listNotes().map((n) => n.id)).toEqual([a.id, b.id])
    } finally {
      spy.mockRestore()
    }
  })

  it('subscribe notifica crear/actualizar/borrar', () => {
    let calls = 0
    const unsub = subscribeToNotes(() => calls++)
    const note = createNote()
    updateNote(note.id, 'x')
    deleteNote(note.id)
    expect(calls).toBe(3)
    unsub()
  })
})
