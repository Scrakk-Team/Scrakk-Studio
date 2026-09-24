// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { describe, it, expect } from 'vitest'
import {
  resolveCustomMode,
  slugifyModeId
} from '../src/renderer/src/services/ai/policy/modeSettings'

describe('modos propios', () => {
  it('slugifyModeId genera ids seguros', () => {
    expect(slugifyModeId('Shell segura')).toBe('shell-segura')
    expect(slugifyModeId('  Modo   Ñandú!! ')).toBe('modo-nandu')
    expect(slugifyModeId('***')).toBe('')
  })

  it('hereda del preset base y solo pisa lo indicado', () => {
    const mode = resolveCustomMode({
      id: 'shell-segura',
      label: 'Shell segura',
      base: 'default',
      overrides: { shellBehavior: 'never' }
    })
    expect(mode).toMatchObject({
      id: 'shell-segura',
      label: 'Shell segura',
      shellBehavior: 'never',
      // Del preset `default`.
      mutationBehavior: 'auto',
      promptPolicy: 'ask'
    })
  })

  it('partir de Plan arrastra su preset de solo lectura', () => {
    const mode = resolveCustomMode({ id: 'solo-lectura', label: 'Solo lectura', base: 'plan' })
    expect(mode).toMatchObject({ mutationBehavior: 'never', shellBehavior: 'never' })
  })

  it('acepta overrides de herramientas', () => {
    const mode = resolveCustomMode({
      id: 'sin-shell',
      label: 'Sin shell',
      base: 'default',
      overrides: { toolFilter: { exclude: ['execute_command'] } }
    })
    expect(mode?.toolFilter).toEqual({ exclude: ['execute_command'] })
  })

  it('cae al preset default si el base no existe', () => {
    const mode = resolveCustomMode({ id: 'x', label: 'X', base: 'no-existe' })
    expect(mode).toMatchObject({ mutationBehavior: 'auto', shellBehavior: 'auto' })
  })
})
