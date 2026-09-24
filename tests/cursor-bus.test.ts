// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del bus de cursor del editor (features/editor/cursorBus.ts).
 *
 * Cubre:
 *  - set/get roundtrip
 *  - subscribe recibe cambios
 *  - no-op si misma posición (evita re-renders innecesarios)
 *  - null limpia el estado
 *  - errores en listeners no contaminan a los demás
 *  - sanitiza coords negativas → null
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  getEditorCursor,
  setEditorCursor,
  subscribeToEditorCursor,
  _resetEditorCursorForTests
} from '../src/renderer/src/features/editor/cursorBus'

describe('editorCursorBus', () => {
  beforeEach(() => {
    _resetEditorCursorForTests()
  })

  it('estado inicial es null', () => {
    expect(getEditorCursor()).toBeNull()
  })

  it('set/get roundtrip', () => {
    setEditorCursor({ line: 5, col: 10 })
    expect(getEditorCursor()).toEqual({ line: 5, col: 10 })
  })

  it('set null limpia el estado', () => {
    setEditorCursor({ line: 1, col: 2 })
    setEditorCursor(null)
    expect(getEditorCursor()).toBeNull()
  })

  it('misma posición es no-op (no llama listeners)', () => {
    setEditorCursor({ line: 3, col: 4 })
    let calls = 0
    const unsub = subscribeToEditorCursor(() => {
      calls++
    })
    setEditorCursor({ line: 3, col: 4 })
    expect(calls).toBe(0)
    unsub()
  })

  it('subscribe recibe cambios', () => {
    const seen: Array<{ line: number; col: number } | null> = []
    const unsub = subscribeToEditorCursor((c) => {
      seen.push(c ? { line: c.line, col: c.col } : null)
    })
    setEditorCursor({ line: 1, col: 1 })
    setEditorCursor({ line: 2, col: 3 })
    setEditorCursor(null)
    unsub()
    expect(seen).toEqual([
      { line: 1, col: 1 },
      { line: 2, col: 3 },
      null
    ])
  })

  it('unsubscribe deja de recibir', () => {
    let calls = 0
    const unsub = subscribeToEditorCursor(() => {
      calls++
    })
    setEditorCursor({ line: 1, col: 1 })
    unsub()
    setEditorCursor({ line: 2, col: 2 })
    expect(calls).toBe(1)
  })

  it('coords negativas se sanitizan a null', () => {
    setEditorCursor({ line: -1, col: 5 })
    expect(getEditorCursor()).toBeNull()
    setEditorCursor({ line: 5, col: -1 })
    expect(getEditorCursor()).toBeNull()
  })

  it('listener que tira no afecta a los demás', () => {
    let aCalls = 0
    let bCalls = 0
    subscribeToEditorCursor(() => {
      aCalls++
      throw new Error('boom')
    })
    const unsubB = subscribeToEditorCursor(() => {
      bCalls++
    })
    setEditorCursor({ line: 7, col: 0 })
    expect(aCalls).toBe(1)
    expect(bCalls).toBe(1)
    unsubB()
  })
})
