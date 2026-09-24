// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del layout drageable de la activity bar (lado + orden por botón).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// El registry de botones lee extensiones (cadena con define de build):
// se mockea como en center-toggle.test.ts.
vi.mock('@services/extensions', () => ({
  ExtensionRegistry: {
    getActivityButtons: (): unknown[] => [],
    subscribe: (): (() => void) => () => {}
  }
}))

import {
  getOrderedButtons,
  buttonPosition,
  moveButton,
  resetButtonLayout,
  snapshotButtonLayout,
  restoreButtonLayout,
  subscribeToButtonLayout,
  _resetButtonLayoutForTests
} from '../src/renderer/src/features/activitybar/layout'

beforeEach(() => {
  _resetButtonLayoutForTests()
})

describe('activitybar layout — defaults', () => {
  it('respeta lado y orden declarados', () => {
    expect(getOrderedButtons('left').map((b) => b.id)).toEqual([
      'explorer',
      'search',
      'browser',
      'debug'
    ])
    // `history` ya no vive en la barra: es una vista dentro del panel de chat.
    expect(getOrderedButtons('right').map((b) => b.id)).toEqual([
      'chat',
      'social',
      'git',
      'notes'
    ])
  })

  it('buttonPosition ubica lado e índice', () => {
    expect(buttonPosition('search')).toEqual({ side: 'left', index: 1 })
    expect(buttonPosition('git')).toEqual({ side: 'right', index: 2 })
    expect(buttonPosition('nope')).toBeNull()
  })
})

describe('activitybar layout — moveButton', () => {
  it('reordena dentro del lado', () => {
    moveButton('debug', 'left', 0)
    expect(getOrderedButtons('left').map((b) => b.id)).toEqual([
      'debug',
      'explorer',
      'search',
      'browser'
    ])
  })

  it('mueve entre barras (cambia el lado)', () => {
    moveButton('git', 'left', 1)
    expect(getOrderedButtons('left').map((b) => b.id)).toEqual([
      'explorer',
      'git',
      'search',
      'browser',
      'debug'
    ])
    expect(getOrderedButtons('right').map((b) => b.id)).toEqual(['chat', 'social', 'notes'])
  })

  it('clampea índices fuera de rango', () => {
    moveButton('explorer', 'right', 99)
    expect(getOrderedButtons('right').map((b) => b.id).at(-1)).toBe('explorer')
    moveButton('explorer', 'right', -5)
    expect(getOrderedButtons('right').map((b) => b.id)[0]).toBe('explorer')
  })

  it('no-op si no cambia nada o el id no existe', () => {
    let calls = 0
    const unsub = subscribeToButtonLayout(() => calls++)
    moveButton('search', 'left', 1)
    moveButton('nope', 'left', 0)
    expect(calls).toBe(0)
    unsub()
  })

  it('emite al mover', () => {
    let calls = 0
    const unsub = subscribeToButtonLayout(() => calls++)
    moveButton('search', 'left', 0)
    expect(calls).toBe(1)
    unsub()
  })

  it('snapshot/restore para cancelar (Escape)', () => {
    moveButton('git', 'left', 0)
    const snap = snapshotButtonLayout()
    moveButton('chat', 'left', 0)
    expect(getOrderedButtons('left')[0].id).toBe('chat')
    restoreButtonLayout(snap)
    expect(getOrderedButtons('left').map((b) => b.id)[0]).toBe('git')
  })

  it('reset vuelve a defaults', () => {
    moveButton('git', 'left', 0)
    resetButtonLayout()
    expect(getOrderedButtons('left').map((b) => b.id)).toEqual([
      'explorer',
      'search',
      'browser',
      'debug'
    ])
  })

  it('restore inválido no rompe', () => {
    restoreButtonLayout('{{{')
    expect(getOrderedButtons('left')).toHaveLength(4)
  })
})
