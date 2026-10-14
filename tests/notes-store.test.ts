// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del store de notas (CRUD + orden + títulos).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
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
  _resetNotesForTests
} from '../src/renderer/src/services/notes/store'
import {
  aiCreateNote,
  aiListNotes,
  aiReadNote,
  aiUpdateNote,
  aiDeleteNote
} from '../src/renderer/src/services/notes/ai'

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

describe('notes — scope (global vs proyecto)', () => {
  beforeEach(() => {
    _resetNotesForTests()
  })

  it('una global se ve en cualquier proyecto; una de proyecto sólo en el suyo', () => {
    const global = createNote({ content: 'g' })
    const a = createNote({ content: 'a', scope: 'project', projectRoot: '/proj/a' })
    const b = createNote({ content: 'b', scope: 'project', projectRoot: '/proj/b' })

    expect(listVisibleNotes('/proj/a').map((n) => n.id).sort()).toEqual([global.id, a.id].sort())
    expect(listVisibleNotes('/proj/b').map((n) => n.id).sort()).toEqual([global.id, b.id].sort())
    // Sin proyecto abierto, sólo las globales.
    expect(listVisibleNotes(null).map((n) => n.id)).toEqual([global.id])
  })

  it('setNoteConfig cambia scope y dueño; volver a global borra el dueño', () => {
    const note = createNote()
    const moved = setNoteConfig(note.id, { scope: 'project', projectRoot: '/p' })
    expect(moved?.scope).toBe('project')
    expect(moved?.projectRoot).toBe('/p')

    const back = setNoteConfig(note.id, { scope: 'global' })
    expect(back?.scope).toBe('global')
    expect(back?.projectRoot).toBeUndefined()
  })

  it('patchNote actualiza contenido y ai sin pisar el resto', () => {
    const note = createNote({ content: 'a' })
    const patched = patchNote(note.id, { content: 'b', ai: { delete: true } })
    expect(patched?.content).toBe('b')
    expect(patched?.ai).toEqual({ read: true, edit: true, delete: true })
  })
})

describe('notes — API de la IA', () => {
  beforeEach(() => {
    _resetNotesForTests()
  })

  it('crea de proyecto si hay proyecto abierto; global si no', () => {
    const withProject = aiCreateNote({ content: 'x' }, '/p')
    expect(withProject.ok).toBe(true)
    if (withProject.ok) {
      expect(withProject.note.scope).toBe('project')
      expect(withProject.note.projectRoot).toBe('/p')
    }
    const withoutProject = aiCreateNote({ content: 'y' }, null)
    if (withoutProject.ok) expect(withoutProject.note.scope).toBe('global')
  })

  it('respeta ai.read en listar y leer', () => {
    const note = createNote({ content: 'secreta' })
    setNoteConfig(note.id, { ai: { read: false } })
    expect(aiListNotes(null)).toEqual([])
    expect(aiReadNote(note.id, null).ok).toBe(false)

    setNoteConfig(note.id, { ai: { read: true } })
    expect(aiReadNote(note.id, null).ok).toBe(true)
  })

  it('respeta ai.edit y ai.delete', () => {
    const note = createNote({ content: 'v1' })
    setNoteConfig(note.id, { ai: { edit: false } })
    expect(aiUpdateNote(note.id, 'v2', null).ok).toBe(false)
    expect(getNote(note.id)?.content).toBe('v1')

    setNoteConfig(note.id, { ai: { delete: false } })
    expect(aiDeleteNote(note.id, null).ok).toBe(false)

    setNoteConfig(note.id, { ai: { edit: true, delete: true } })
    expect(aiUpdateNote(note.id, 'v3', null).ok).toBe(true)
    expect(aiDeleteNote(note.id, null).ok).toBe(true)
    expect(getNote(note.id)).toBeNull()
  })

  it('no ve ni toca notas de otro proyecto', () => {
    const note = createNote({ content: 'p', scope: 'project', projectRoot: '/a' })
    expect(aiReadNote(note.id, '/b').ok).toBe(false)
    expect(aiUpdateNote(note.id, 'x', '/b').ok).toBe(false)
    expect(aiDeleteNote(note.id, '/b').ok).toBe(false)
    expect(aiReadNote(note.id, '/a').ok).toBe(true)
  })
})
