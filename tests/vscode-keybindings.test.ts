// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del traductor de `keybindings.json` de VS Code.
 *
 * Casos reales que trae un archivo de usuario: overrides por plataforma,
 * chords, `when`, bindings negativos, comandos de extensiones y atajos de
 * macOS. Lo que no se puede traducir se REPORTA; nunca se aplica a medias.
 */

import { describe, expect, it } from 'vitest'
import {
  detectKeymapPlatform,
  translateKeybindings,
  translateKey
} from '../src/shared/compatibility/vscode/keybindings/translate'

describe('translateKey', () => {
  it('combina modificadores y los ordena como el motor', () => {
    expect(translateKey('Shift+Ctrl+P')).toEqual({ combo: 'ctrl+shift+p' })
    expect(translateKey('Ctrl+Alt+Up')).toEqual({ combo: 'ctrl+alt+up' })
  })

  it('acepta chords (dos combinaciones seguidas)', () => {
    expect(translateKey('Ctrl+K Ctrl+S')).toEqual({ combo: 'ctrl+k ctrl+s' })
  })

  it('convierte la tecla Windows a meta', () => {
    expect(translateKey('Win+Space')).toEqual({ combo: 'meta+space' })
  })

  it('rechaza atajos de macOS', () => {
    const result = translateKey('Cmd+S')
    expect('reason' in result && result.status).toBe('mac-only')
  })

  it('rechaza teclas dependientes del layout y desconocidas', () => {
    expect(translateKey('Ctrl+Oem1')).toMatchObject({ status: 'invalid-key' })
    expect(translateKey('Ctrl+Hola')).toMatchObject({ status: 'invalid-key' })
  })
})

describe('translateKeybindings', () => {
  const sample = `// teclas de ejemplo (JSONC con comentarios)
  [
    { "key": "ctrl+shift+p", "command": "workbench.action.showCommands" },
    { "key": "ctrl+k s", "command": "workbench.action.files.saveAll" },
    { "key": "ctrl+alt+o", "command": "workbench.action.files.openFolder" },
    { "key": "ctrl+shift+e", "command": "workbench.view.explorer", "when": "editorTextFocus" },
    { "key": "ctrl+u", "command": "-cursorUndo" },
    { "key": "cmd+s", "command": "workbench.action.files.save" },
    { "key": "ctrl+alt+n", "win": "ctrl+shift+n", "linux": "ctrl+shift+n", "command": "workbench.action.files.newUntitledFile" },
    { "key": "ctrl+oem1", "command": "workbench.action.files.openFile" },
    { "key": "ctrl+alt+9", "command": "extension.sayHello" }
  ]`

  it('clasifica cada entrada con su motivo', () => {
    const result = translateKeybindings(sample, { platform: 'linux' })
    const byCommand = new Map(result.bindings.map((binding) => [binding.sourceCommand, binding]))

    expect(byCommand.get('workbench.action.showCommands')).toMatchObject({
      status: 'ok',
      command: 'palette.open',
      combo: 'ctrl+shift+p'
    })
    // Chord real de VS Code.
    expect(byCommand.get('workbench.action.files.saveAll')).toMatchObject({
      status: 'ok',
      command: 'file.saveAll',
      combo: 'ctrl+k s'
    })
    // No hay comando `openFolder` nuestro en el mapa → se reporta.
    expect(byCommand.get('workbench.action.files.openFolder')).toMatchObject({
      status: 'no-command',
      command: null
    })
    expect(byCommand.get('workbench.view.explorer')).toMatchObject({ status: 'when' })
    expect(byCommand.get('-cursorUndo')).toMatchObject({ status: 'negative' })
    expect(byCommand.get('workbench.action.files.save')).toMatchObject({ status: 'mac-only' })
    expect(byCommand.get('workbench.action.files.newUntitledFile')).toMatchObject({
      status: 'ok',
      command: 'file.new',
      combo: 'ctrl+shift+n' // override linux/win, no el `key` base
    })
    expect(byCommand.get('workbench.action.files.openFile')).toMatchObject({ status: 'invalid-key' })
    expect(byCommand.get('extension.sayHello')).toMatchObject({ status: 'no-command' })
  })

  it('cuenta por estado', () => {
    const { stats } = translateKeybindings(sample, { platform: 'linux' })
    expect(stats.ok).toBe(3)
    expect(stats.when).toBe(1)
    expect(stats.negative).toBe(1)
    expect(stats['mac-only']).toBe(1)
    expect(stats['invalid-key']).toBe(1)
    expect(stats['no-command']).toBe(2)
  })

  it('un archivo inválido devuelve error, no excepción', () => {
    expect(translateKeybindings('{ no es json').error).toMatch(/No se pudo leer/)
    expect(translateKeybindings('{ "key": "ctrl+s" }').error).toMatch(/no es un array/)
  })

  it('la plataforma se detecta sin explotar fuera del navegador', () => {
    expect(['win', 'linux']).toContain(detectKeymapPlatform())
  })
})
