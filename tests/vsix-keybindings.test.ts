// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Traductor VSIX → SEF de `contributes.keybindings`.
 * Traduce comandos + combinaciones (chords incluidos) y descarta lo que no
 * tiene equivalente honesto: `when`, negativos y teclas de macOS.
 */

import { describe, expect, it } from 'vitest'
import {
  detectKeybindings,
  translateKeybindings
} from '../src/shared/compatibility/vscode/translators/types/keybindings/keybindings'

const manifest = {
  contributes: {
    keybindings: [
      { command: 'acme.deploy', key: 'Ctrl+Shift+D' },
      { command: 'acme.deployAll', key: 'Ctrl+K Ctrl+D' },
      { command: 'acme.conditional', key: 'ctrl+d', when: 'editorTextFocus' },
      { command: '-acme.deploy', key: 'ctrl+q' },
      { command: 'acme.mac', key: 'Cmd+S' }
    ]
  }
}

describe('traductor de keybindings de VSIX', () => {
  it('detecta el contribution point', () => {
    expect(detectKeybindings(manifest as never)).toBe(true)
    expect(detectKeybindings({} as never)).toBe(false)
  })

  it('traduce command + key y normaliza (chords incluidos)', () => {
    const out = translateKeybindings(manifest as never, [], { extensionId: 'acme' })
    expect(out.contributions).toEqual([
      { command: 'acme.deploy', key: 'ctrl+shift+d' },
      { command: 'acme.deployAll', key: 'ctrl+k ctrl+d' }
    ])
  })

  it('reporta cobertura parcial cuando descarta entradas', () => {
    const out = translateKeybindings(manifest as never, [], { extensionId: 'acme' })
    expect(out.mapped[0]).toMatchObject({ target: 'keybindings', support: 'partial' })
    expect(out.mapped[0].note).toMatch(/3 atajo/)
  })
})
