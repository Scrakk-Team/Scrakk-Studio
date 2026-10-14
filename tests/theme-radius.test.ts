// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests de las ESQUINAS del theme (`radius`): shorthand, mapa por slot,
 * validación (inyección CSS) y resolución contra el tema base.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  THEME_RADIUS_SLOTS,
  normalizeRadiusValue,
  normalizeThemeDefinition,
  normalizeThemeRadius
} from '../src/renderer/src/services/extensions/types/themes/schema'
import { resolveThemeRadius } from '../src/renderer/src/services/extensions/types/themes/logic'

describe('normalizeRadiusValue', () => {
  it('acepta px/rem/em/% razonables', () => {
    expect(normalizeRadiusValue('0px')).toBe('0px')
    expect(normalizeRadiusValue('12px')).toBe('12px')
    expect(normalizeRadiusValue(' 1.5rem ')).toBe('1.5rem')
    expect(normalizeRadiusValue('50%')).toBe('50%')
  })

  it('rechaza basura: sin unidad, funciones, inyección y % absurdo', () => {
    expect(normalizeRadiusValue('12')).toBeNull()
    expect(normalizeRadiusValue('calc(1px + 1px)')).toBeNull()
    expect(normalizeRadiusValue('0px; body{display:none}')).toBeNull()
    expect(normalizeRadiusValue('90%')).toBeNull()
    expect(normalizeRadiusValue(12)).toBeNull()
  })
})

describe('normalizeThemeRadius', () => {
  it('shorthand rect / round (tolerante a mayúsculas y espacios)', () => {
    expect(normalizeThemeRadius('rect')).toBe('rect')
    expect(normalizeThemeRadius(' ROUND ')).toBe('round')
  })

  it('shorthand desconocido se ignora sin romper el tema', () => {
    expect(normalizeThemeRadius('blah')).toBeUndefined()
    expect(normalizeThemeRadius(null)).toBeUndefined()
    expect(normalizeThemeRadius(3)).toBeUndefined()
  })

  it('mapa por slot: solo los válidos', () => {
    expect(normalizeThemeRadius({ panel: '16px', input: 'malo', sm: '6px' })).toEqual({
      panel: '16px',
      sm: '6px'
    })
    expect(normalizeThemeRadius({})).toBeUndefined()
  })

  it('acepta TODOS los slots', () => {
    const all = Object.fromEntries(THEME_RADIUS_SLOTS.map((slot) => [slot, '4px']))
    expect(normalizeThemeRadius(all)).toEqual(all)
  })

  it('viaja en normalizeThemeDefinition', () => {
    const def = normalizeThemeDefinition({
      name: 'T',
      type: 'dark',
      colors: {},
      radius: 'rect'
    })
    expect(def?.radius).toBe('rect')
  })
})

describe('resolveThemeRadius', () => {
  it('sin radius propio y sin base registrada → undefined (radios del sistema)', () => {
    const def = normalizeThemeDefinition({ name: 'T', type: 'dark', colors: {} })
    expect(def).not.toBeNull()
    expect(resolveThemeRadius(def!)).toBeUndefined()
  })

  it('el del tema gana (mapa por slot)', () => {
    const def = normalizeThemeDefinition({
      name: 'T',
      type: 'dark',
      colors: {},
      radius: { panel: '0px' }
    })
    expect(resolveThemeRadius(def!)).toEqual({ panel: '0px' })
  })
})

describe('temas builtin', () => {
  it('opencode-ai viaja con esquinas rectas', () => {
    const raw = readFileSync(
      new URL(
        '../src/renderer/src/services/extensions/builtin/themes/opencode-ai/theme.json',
        import.meta.url
      ),
      'utf-8'
    )
    const def = normalizeThemeDefinition(JSON.parse(raw))
    expect(def).not.toBeNull()
    expect(def!.radius).toBe('rect')
  })

  it('vscode-dark-modern viaja con esquinas DISMINUIDAS (no rectas)', () => {
    const raw = readFileSync(
      new URL(
        '../src/renderer/src/services/extensions/builtin/themes/vscode-dark-modern/theme.json',
        import.meta.url
      ),
      'utf-8'
    )
    const def = normalizeThemeDefinition(JSON.parse(raw))
    expect(def).not.toBeNull()
    expect(def!.radius).toEqual({
      panel: '8px',
      md: '8px',
      input: '6px',
      sm: '5px',
      xs: '4px'
    })
  })

  it('discord viaja con esquinas AUMENTADAS', () => {
    const raw = readFileSync(
      new URL(
        '../src/renderer/src/services/extensions/builtin/themes/discord/theme.json',
        import.meta.url
      ),
      'utf-8'
    )
    const def = normalizeThemeDefinition(JSON.parse(raw))
    expect(def).not.toBeNull()
    expect(def!.radius).toEqual({
      panel: '16px',
      md: '16px',
      input: '12px',
      sm: '10px',
      xs: '6px'
    })
  })
})
