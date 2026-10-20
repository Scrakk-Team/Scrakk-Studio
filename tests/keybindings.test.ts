// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests de KEYMAPS — re-mapear comandos sobre el motor de atajos existente.
 *
 * Lo que se fija acá:
 *  - aplicar un preset cambia el `keybinding` de los comandos que existen;
 *  - los que no existen se reportan (`missing`), nunca se inventan;
 *  - el atajo VIEJO no queda vivo (el bug del `allowOverwrite` → atajo huérfano);
 *  - reset vuelve al keymap de Scrakk;
 *  - `listKeybindings()` refleja el estado efectivo.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { commandRegistry } from '../src/renderer/src/services/commands/registry'
import { shortcuts } from '../src/renderer/src/services/shortcuts'
import { KEYMAP_PRESETS, applyKeymap, resetKeymap, listKeybindings } from '../src/renderer/src/services/keybindings'

const COMMANDS = [
  { id: 'file.save', title: 'Guardar archivo', category: 'Archivo', keybinding: 'mod+s' },
  { id: 'editor.closeActiveFile', title: 'Cerrar archivo', category: 'Editor', keybinding: 'mod+w' },
  { id: 'terminal.toggle', title: 'Terminal', category: 'Terminal', keybinding: 'mod+`' }
]

function registerSamples(): void {
  for (const command of COMMANDS) {
    commandRegistry.register({ ...command, run: () => undefined }, { allowOverwrite: true })
  }
}

function comboOf(id: string): string | undefined {
  return commandRegistry.get(id)?.keybinding
}

/** Combos con los que el motor tiene registrado el atajo de un comando. */
function engineCombosFor(id: string): string[] {
  return shortcuts
    .getAll()
    .filter((entry) => entry.actions.some((action) => action.id === `command:${id}`))
    .map((entry) => entry.combo)
}

describe('keymaps — presets', () => {
  beforeEach(() => {
    for (const command of commandRegistry.list()) commandRegistry.unregister(command.id)
    registerSamples()
  })

  it('aplicar VS Code / JetBrains cambia el combo del comando', () => {
    applyKeymap('vscode', { persist: false })
    expect(comboOf('file.save')).toBe('mod+s')
    expect(comboOf('editor.closeActiveFile')).toBe('mod+w')

    applyKeymap('jetbrains', { persist: false })
    expect(comboOf('editor.closeActiveFile')).toBe('ctrl+f4')
    expect(comboOf('terminal.toggle')).toBe('alt+f12')
  })

  it('el atajo VIEJO no queda vivo al re-mapear', () => {
    // `mod+w` (default) → jetbrains `ctrl+f4`: el motor no debe seguir
    // disparando el comando con el combo anterior.
    shortcuts.register({ id: 'probe', combo: 'mod+w', handler: () => undefined })

    applyKeymap('jetbrains', { persist: false })
    expect(engineCombosFor('editor.closeActiveFile')).toEqual(['ctrl+f4'])
    expect(engineCombosFor('editor.closeActiveFile')).not.toContain('mod+w')
  })

  it('reporta los comandos que todavía no existen, sin inventarlos', () => {
    const result = applyKeymap('vscode', { persist: false })
    expect(result.applied).toBe(COMMANDS.length)
    expect(result.missing).toContain('layout.toggleExplorer')
    expect(commandRegistry.get('layout.toggleExplorer')).toBeNull()
  })

  it('reset vuelve al keymap de Scrakk', () => {
    applyKeymap('jetbrains', { persist: false })
    expect(comboOf('editor.closeActiveFile')).toBe('ctrl+f4')
    resetKeymap()
    expect(comboOf('editor.closeActiveFile')).toBe('mod+w')
    expect(comboOf('file.save')).toBe('mod+s')
  })

  it('los presets no usan macOS ni chords', () => {
    for (const preset of Object.values(KEYMAP_PRESETS)) {
      for (const binding of preset.bindings) {
        if (!binding.key) continue
        expect(binding.key).not.toMatch(/\b(meta|cmd|command)\b/)
        // Un chord se escribe con espacio ('ctrl+k ctrl+s'); el motor no lo soporta.
        expect(binding.key).not.toMatch(/\s/)
      }
    }
  })

  it('listKeybindings refleja el estado efectivo (con display)', () => {
    applyKeymap('vscode', { persist: false })
    const rows = listKeybindings()
    const save = rows.find((row) => row.command === 'file.save')
    expect(save?.combo).toBe('mod+s')
    expect(save?.display).toBe('Ctrl+S')
  })
})
