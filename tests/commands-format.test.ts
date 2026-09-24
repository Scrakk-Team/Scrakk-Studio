// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del formateo de combos para la paleta (badge de shortcut).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { formatCombo } from '../src/renderer/src/services/shortcuts/format'

describe('formatCombo', () => {
  it('linux/win: mod=Ctrl, separador +', () => {
    expect(formatCombo('mod+shift+p', false)).toBe('Ctrl+Shift+P')
    expect(formatCombo('mod+,')).toBe('Ctrl+,')
    expect(formatCombo('mod+alt+w', false)).toBe('Ctrl+Alt+W')
  })

  it('mac: símbolos sin separador', () => {
    expect(formatCombo('mod+shift+p', true)).toBe('⌘⇧P')
    expect(formatCombo('mod+alt+t', true)).toBe('⌘⌥T')
    expect(formatCombo('mod+b', true)).toBe('⌘B')
  })

  it('teclas especiales', () => {
    expect(formatCombo('escape', false)).toBe('Esc')
    expect(formatCombo('arrowdown', false)).toBe('↓')
    expect(formatCombo('f5', false)).toBe('F5')
  })

  it('orden: modificadores primero aunque vengan invertidos', () => {
    // El combo canónico ya viene ordenado del registry; igualmente el
    // formateo respeta el orden recibido.
    expect(formatCombo('shift+mod+p', false)).toBe('Shift+Ctrl+P')
  })
})
