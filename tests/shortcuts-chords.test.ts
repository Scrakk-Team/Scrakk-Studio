// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests de CHORDS — atajos en secuencia (`Ctrl+K` y después `Ctrl+S`).
 *
 * Se prueba la parte pura (parseo, formato y la máquina de estados) y que el
 * registry los guarde con su combo completo, sin tocar DOM.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { formatCombo } from '../src/renderer/src/services/shortcuts/format'
import { parseComboSpec } from '../src/renderer/src/services/shortcuts/key'
import { ChordTracker } from '../src/renderer/src/services/shortcuts/chords'
import { shortcuts } from '../src/renderer/src/services/shortcuts'

describe('parseComboSpec', () => {
  it('una combinación simple es un solo segmento', () => {
    const spec = parseComboSpec('mod+s')
    expect(spec.segments).toHaveLength(1)
    expect(spec.combo).toBe('ctrl+s') // `mod` se resuelve a ctrl fuera de macOS
  })

  it('un chord son dos segmentos y el canónico lleva un espacio', () => {
    const spec = parseComboSpec('ctrl+k ctrl+s')
    expect(spec.segments).toHaveLength(2)
    expect(spec.combo).toBe('ctrl+k ctrl+s')
    expect(spec.segments[1].key).toBe('s')
  })

  it('tolera espacios de más y mayúsculas', () => {
    expect(parseComboSpec('  Ctrl+K   Ctrl+Shift+P  ').combo).toBe('ctrl+k ctrl+shift+p')
  })

  it('rechaza una spec vacía', () => {
    expect(() => parseComboSpec('   ')).toThrow()
  })
})

describe('formatCombo con chords', () => {
  it('muestra cada segmento separado por espacio', () => {
    expect(formatCombo('ctrl+k ctrl+s', false)).toBe('Ctrl+K Ctrl+S')
  })
})

describe('ChordTracker', () => {
  // `ctrl+p` es un atajo simple registrado; el chord es el otro.
  const has = (candidate: string): boolean =>
    candidate === 'ctrl+k ctrl+s' || candidate === 'ctrl+p'
  const isPrefix = (candidate: string): boolean => 'ctrl+k ctrl+s'.startsWith(`${candidate} `)

  it('la primera parte espera; la segunda ejecuta el chord completo', () => {
    const tracker = new ChordTracker()
    expect(tracker.push('ctrl+k', has, isPrefix)).toEqual({ run: null, wait: true })
    expect(tracker.pendingCombo).toBe('ctrl+k')
    expect(tracker.push('ctrl+s', has, isPrefix)).toEqual({ run: 'ctrl+k ctrl+s', wait: false })
    expect(tracker.pendingCombo).toBeNull()
  })

  it('una combinación simple se ejecuta de una', () => {
    const tracker = new ChordTracker()
    expect(tracker.push('ctrl+p', has, isPrefix)).toEqual({ run: 'ctrl+p', wait: false })
  })

  it('una secuencia inválida cancela lo pendiente y no ejecuta nada', () => {
    const tracker = new ChordTracker()
    tracker.push('ctrl+k', has, isPrefix)
    expect(tracker.push('ctrl+x', has, isPrefix)).toEqual({ run: null, wait: false })
    expect(tracker.pendingCombo).toBeNull()
  })

  it('reset descarta la secuencia a medias (timeout)', () => {
    const tracker = new ChordTracker()
    tracker.push('ctrl+k', has, isPrefix)
    tracker.reset()
    expect(tracker.pendingCombo).toBeNull()
    // Después del reset, `ctrl+s` ya no forma el chord.
    expect(tracker.push('ctrl+s', has, isPrefix)).toEqual({ run: null, wait: false })
  })
})

describe('registry con chords', () => {
  beforeEach(() => {
    for (const entry of shortcuts.getAll()) {
      for (const action of entry.actions) shortcuts.unregister(action.id)
    }
  })

  it('registra un chord con su combo completo y lo lista', () => {
    const calls: string[] = []
    shortcuts.register({
      id: 'test.chord',
      combo: 'ctrl+k ctrl+s',
      handler: () => calls.push('chord')
    })
    expect(shortcuts.has('ctrl+k ctrl+s')).toBe(true)
    expect(shortcuts.has('ctrl+x')).toBe(false)
    const combos = shortcuts.getAll().map((entry) => entry.combo)
    expect(combos).toContain('ctrl+k ctrl+s')
    expect(calls).toHaveLength(0)
  })
})
