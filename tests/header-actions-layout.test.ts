// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del orden drageable de los botones de header (mismo sistema que el
 * layout de la activity bar, en una sola fila).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  orderHeaderActions,
  moveHeaderAction,
  resetHeaderActions,
  snapshotHeaderActions,
  restoreHeaderActions,
  subscribeToHeaderActions,
  _resetHeaderActionsForTests
} from '../src/renderer/src/features/layout/state/headerActions'

/** Declaración típica de un panel: 4 acciones con su id namespaced. */
const declared = [
  { id: 'explorer.new-file', order: 0 },
  { id: 'explorer.new-folder', order: 10 },
  { id: 'explorer.git-badges', order: 20 },
  { id: 'explorer.refresh', order: 30 }
]

const ids = (): string[] => orderHeaderActions(declared).map((action) => action.id)

beforeEach(() => {
  _resetHeaderActionsForTests()
})

describe('header actions — defaults', () => {
  it('sin overrides respeta el orden declarado', () => {
    expect(ids()).toEqual([
      'explorer.new-file',
      'explorer.new-folder',
      'explorer.git-badges',
      'explorer.refresh'
    ])
  })

  it('sin `order` explícito usa la posición declarada (estable)', () => {
    const flat = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(orderHeaderActions(flat).map((a) => a.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('header actions — moveHeaderAction', () => {
  const orderedIds = declared.map((action) => action.id)

  it('reordena dentro del header', () => {
    moveHeaderAction('explorer.refresh', 0, orderedIds)
    expect(ids()).toEqual([
      'explorer.refresh',
      'explorer.new-file',
      'explorer.new-folder',
      'explorer.git-badges'
    ])
  })

  it('mueve al medio', () => {
    moveHeaderAction('explorer.refresh', 1, orderedIds)
    expect(ids()).toEqual([
      'explorer.new-file',
      'explorer.refresh',
      'explorer.new-folder',
      'explorer.git-badges'
    ])
  })

  it('clampea índices fuera de rango', () => {
    moveHeaderAction('explorer.new-file', 99, orderedIds)
    expect(ids().at(-1)).toBe('explorer.new-file')
    // El drag siempre pasa el orden ACTUAL (lo lee del DOM), no el declarado.
    moveHeaderAction('explorer.new-file', -5, ids())
    expect(ids()[0]).toBe('explorer.new-file')
  })

  it('no-op si la posición no cambia o el id no existe', () => {
    let calls = 0
    const unsub = subscribeToHeaderActions(() => calls++)
    moveHeaderAction('explorer.new-file', 0, orderedIds)
    moveHeaderAction('nope', 0, orderedIds)
    expect(calls).toBe(0)
    unsub()
  })

  it('emite al mover', () => {
    let calls = 0
    const unsub = subscribeToHeaderActions(() => calls++)
    moveHeaderAction('explorer.refresh', 0, orderedIds)
    expect(calls).toBe(1)
    unsub()
  })

  it('una acción NUEVA (sin override) cae en su posición declarada', () => {
    moveHeaderAction('explorer.refresh', 0, orderedIds)
    // `collapse-all` (order 25) no tiene override: se inserta entre el 20 y el
    // 30 en vez de quedar empujada al final por los overrides del usuario.
    const withNew = [...declared, { id: 'explorer.collapse-all', order: 25 }]
    expect(orderHeaderActions(withNew).map((action) => action.id)).toEqual([
      'explorer.refresh',
      'explorer.new-file',
      'explorer.collapse-all',
      'explorer.new-folder',
      'explorer.git-badges'
    ])
  })

  it('snapshot/restore para cancelar (Escape)', () => {
    moveHeaderAction('explorer.refresh', 0, orderedIds)
    const snap = snapshotHeaderActions()
    moveHeaderAction('explorer.new-file', 3, orderedIds)
    expect(ids().at(-1)).toBe('explorer.new-file')
    restoreHeaderActions(snap)
    expect(ids()[0]).toBe('explorer.refresh')
  })

  it('reset vuelve al orden declarado', () => {
    moveHeaderAction('explorer.refresh', 0, orderedIds)
    resetHeaderActions()
    expect(ids()[0]).toBe('explorer.new-file')
  })

  it('restore inválido no rompe', () => {
    restoreHeaderActions('{{{')
    expect(orderHeaderActions(declared)).toHaveLength(4)
  })
})
