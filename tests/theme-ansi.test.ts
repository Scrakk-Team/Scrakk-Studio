// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Paleta ANSI del tema: las dos formas (`ansi` inline y `ansi.json` hermano),
 * la precedencia del archivo, la herencia del tema base y el puente al motor.
 *
 * El caso que motivó todo: un tema claro sin paleta propia usaba la del motor
 * (pensada para fondo oscuro) y los blancos SGR quedaban invisibles.
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  normalizeThemeAnsi,
  normalizeThemeDefinition
} from '@services/extensions/types/themes/schema'
import {
  registerTheme,
  unregisterTheme,
  resolveThemeAnsi,
  DEFAULT_LIGHT_THEME_ID,
  DEFAULT_THEME_ID
} from '@services/extensions/types/themes/logic'
import { mergeAnsiFile, siblingAnsiPath } from '@services/extensions/types/themes/ansiJson'
import { ANSI_SLOTS, resolveAnsiSlots } from '@features/editor/engines/innerta/innertaTheme'
import type { ThemeDefinition } from '@services/extensions/types/themes/schema'

function def(partial: Partial<ThemeDefinition> & { name: string }): ThemeDefinition {
  return { type: 'dark', colors: {}, ...partial } as ThemeDefinition
}

const cleanups: string[] = []
afterEach(() => {
  for (const id of cleanups.splice(0)) unregisterTheme(id)
})

describe('normalizeThemeAnsi', () => {
  it('acepta slots válidos y descarta los que no son colores concretos', () => {
    const ansi = normalizeThemeAnsi({
      black: '#0a0a0a',
      red: 'rgb(207, 34, 46)',
      green: 'var(--color-success)',
      blue: 'transparent',
      white: 42,
      brightWhite: '#24292f'
    })
    expect(ansi).toEqual({
      black: '#0a0a0a',
      red: 'rgb(207, 34, 46)',
      brightWhite: '#24292f'
    })
  })

  it('un objeto sin ningún slot válido no produce paleta', () => {
    expect(normalizeThemeAnsi({ black: 'nope' })).toBeUndefined()
    expect(normalizeThemeAnsi('nope')).toBeUndefined()
  })

  it('theme.json lleva la paleta inline al schema', () => {
    const definition = normalizeThemeDefinition({
      name: 'Tema',
      type: 'light',
      colors: {},
      ansi: { black: '#111111', white: '#6e7781' }
    })
    expect(definition?.ansi).toEqual({ black: '#111111', white: '#6e7781' })
  })
})

describe('ansi.json', () => {
  it('el archivo hermano conserva el directorio del theme.json', () => {
    expect(siblingAnsiPath('themes/foo.json')).toBe('themes/ansi.json')
    expect(siblingAnsiPath('a/b/foo.json')).toBe('a/b/ansi.json')
    expect(siblingAnsiPath('ansi.json')).toBe('ansi.json')
    expect(siblingAnsiPath('a\\foo.json')).toBe('a\\ansi.json')
  })

  it('gana el archivo slot por slot, sin borrar la paleta inline', () => {
    const base = def({ name: 'Tema', ansi: { black: '#000000', red: '#ff0000' } })
    const merged = mergeAnsiFile(base, { red: '#aa0000', brightWhite: '#ffffff' })
    expect(merged.ansi).toEqual({
      black: '#000000',
      red: '#aa0000',
      brightWhite: '#ffffff'
    })
  })

  it('un archivo inválido deja la definición intacta', () => {
    const base = def({ name: 'Tema', ansi: { black: '#000000' } })
    expect(mergeAnsiFile(base, null)).toBe(base)
    expect(mergeAnsiFile(base, { red: 'var(--x)' })).toBe(base)
  })
})

describe('resolveThemeAnsi', () => {
  it('un tema claro sin paleta hereda la del tema base claro', () => {
    registerTheme({
      id: DEFAULT_LIGHT_THEME_ID,
      name: 'Base light',
      type: 'light',
      extensionId: DEFAULT_LIGHT_THEME_ID,
      isBuiltin: true,
      definition: def({
        name: 'Base light',
        type: 'light',
        ansi: { black: '#0a0a0a', white: '#6e7781' }
      })
    })
    cleanups.push(DEFAULT_LIGHT_THEME_ID)

    expect(resolveThemeAnsi(def({ name: 'Parcial', type: 'light' }))).toEqual({
      black: '#0a0a0a',
      white: '#6e7781'
    })
  })

  it('la paleta propia gana slot por slot sobre la base', () => {
    registerTheme({
      id: DEFAULT_THEME_ID,
      name: 'Base dark',
      type: 'dark',
      extensionId: DEFAULT_THEME_ID,
      isBuiltin: true,
      definition: def({ name: 'Base dark', ansi: { black: '#000000', red: '#cd3131' } })
    })
    cleanups.push(DEFAULT_THEME_ID)

    expect(
      resolveThemeAnsi(def({ name: 'Propio', ansi: { red: '#ff0000', cyan: '#00ffff' } }))
    ).toEqual({ black: '#000000', red: '#ff0000', cyan: '#00ffff' })
  })
})

describe('puente al motor', () => {
  it('el índice de cada slot es el que espera SetInnertaAnsiColor', () => {
    expect(ANSI_SLOTS[0]).toBe('black')
    expect(ANSI_SLOTS[7]).toBe('white')
    expect(ANSI_SLOTS[8]).toBe('brightBlack')
    expect(ANSI_SLOTS[15]).toBe('brightWhite')
  })

  it('solo convierte los slots presentes, con alfa opaco', () => {
    const slots = resolveAnsiSlots({ black: '#0a0a0a', brightWhite: '#24292f' })
    expect(slots).toEqual([
      [0, 0x0a0a0aff],
      [15, 0x24292fff]
    ])
  })

  it('sin paleta no manda nada (el motor conserva la suya)', () => {
    expect(resolveAnsiSlots(undefined)).toEqual([])
  })
})
