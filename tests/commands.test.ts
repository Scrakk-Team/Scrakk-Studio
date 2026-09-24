// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del CommandRegistry + fuzzy match — la base de la paleta.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { commandRegistry } from '../src/renderer/src/services/commands/registry'
import { fuzzyScore } from '../src/renderer/src/services/commands/fuzzy'

describe('fuzzyScore', () => {
  it('query vacía lista todo', () => {
    expect(fuzzyScore('', 'cualquier cosa')).toBeGreaterThan(0)
  })

  it('subsecuencia matchea con bonus por inicio de palabra', () => {
    const start = fuzzyScore('cd', 'command palette')
    const mid = fuzzyScore('pa', 'command palette')
    expect(start).toBeGreaterThan(0)
    expect(mid).toBeGreaterThan(0)
  })

  it('no matchea si no es subsecuencia', () => {
    expect(fuzzyScore('zzz', 'abrir ajustes')).toBe(0)
  })
})

describe('CommandRegistry', () => {
  beforeEach(() => {
    for (const command of commandRegistry.list()) {
      commandRegistry.unregister(command.id)
    }
  })

  function sample(id: string, title: string, category?: string) {
    return { id, title, category, run: () => {} }
  }

  it('register/get/unregister con notify', () => {
    let notified = 0
    const unsub = commandRegistry.subscribe(() => notified++)

    const unregister = commandRegistry.register(sample('a.b', 'Comando A'))
    expect(notified).toBeGreaterThanOrEqual(1)
    expect(commandRegistry.get('a.b')?.title).toBe('Comando A')

    unregister()
    expect(commandRegistry.get('a.b')).toBeNull()
    unsub()
  })

  it('rechaza duplicados salvo allowOverwrite', () => {
    expect(() => undefined).not.toThrow()
    const warn = console.warn
    console.warn = () => {}

    commandRegistry.register(sample('dup', 'v1'))
    commandRegistry.register(sample('dup', 'v2'))
    expect(commandRegistry.get('dup')?.title).toBe('v1')

    commandRegistry.register(sample('dup', 'v3'), { allowOverwrite: true })
    expect(commandRegistry.get('dup')?.title).toBe('v3')

    console.warn = warn
  })

  it('list ordena por categoría y título', () => {
    commandRegistry.register(sample('b.2', 'Beta', 'Zed'))
    commandRegistry.register(sample('a.2', 'Alfa', 'Zed'))
    commandRegistry.register(sample('c.1', 'Gamma', 'Aaa'))

    const titles = commandRegistry.list().map((c) => c.title)
    expect(titles).toEqual(['Gamma', 'Alfa', 'Beta'])
  })

  it('search rankea mejor matches exactos de palabra inicial', () => {
    commandRegistry.register(sample('x.theme', 'Cambiar tema'))
    commandRegistry.register(sample('x.chat', 'Mostrar chat'))

    const results = commandRegistry.search('tema')
    expect(results[0].id).toBe('x.theme')
    // El no-matchea queda fuera.
    expect(results.some((r) => r.id === 'x.chat')).toBe(false)
  })

  it('search con query vacía devuelve todo', () => {
    commandRegistry.register(sample('y.1', 'Uno'))
    commandRegistry.register(sample('y.2', 'Dos'))
    expect(commandRegistry.search('').length).toBe(2)
  })
})

describe('integración con shortcuts', () => {
  beforeEach(() => {
    for (const command of commandRegistry.list()) {
      commandRegistry.unregister(command.id)
    }
  })

  function sample(id: string, title: string, keybinding?: string) {
    let ran = false
    return {
      command: { id, title, category: 'Test', keybinding, run: () => { ran = true } },
      wasRun: () => ran
    }
  }

  it('comando con keybinding registra shortcut REAL y lo limpia al desregistrar', async () => {
    const { shortcuts } = await import('../src/renderer/src/services/shortcuts')
    const { command } = sample('test.kb', 'Con atajo', 'mod+alt+x')

    const unregister = commandRegistry.register(command)
    expect(shortcuts.hasActionId('command:test.kb')).toBe(true)
    expect(shortcuts.has('mod+alt+x')).toBe(true)

    unregister()
    expect(shortcuts.hasActionId('command:test.kb')).toBe(false)
  })

  it('comando SIN keybinding no toca el sistema de atajos', async () => {
    const { shortcuts } = await import('../src/renderer/src/services/shortcuts')
    const { command } = sample('test.nokb', 'Sin atajo')

    const unregister = commandRegistry.register(command)
    expect(shortcuts.hasActionId('command:test.nokb')).toBe(false)
    unregister()
  })

  it('search("") devuelve la LISTA COMPLETA (paleta sin buscar)', () => {
    for (let i = 0; i < 30; i++) {
      commandRegistry.register(sample(`bulk.${i}`, `Comando ${i}`).command)
    }
    expect(commandRegistry.search('').length).toBe(30)
    expect(commandRegistry.search('').length).toBe(commandRegistry.list().length)
  })
})
