// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Modo PC mala (Fase 6): store de bajo consumo.
 *
 * El tope de módulos en background ya no existe (ahora es un motor por panel
 * con N sesiones), así que acá queda la parte del store.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

import {
  isLowEndMode,
  setLowEndMode,
  subscribeLowEndMode,
  resetLowEndModeForTests
} from '@services/perf'

describe('modo PC mala', () => {
  it('store: default off, persiste y emite', () => {
    resetLowEndModeForTests()
    expect(isLowEndMode()).toBe(false)
    let calls = 0
    const off = subscribeLowEndMode(() => calls++)
    setLowEndMode(true)
    expect(isLowEndMode()).toBe(true)
    expect(calls).toBe(1)
    setLowEndMode(true)
    expect(calls).toBe(1) // sin cambios no emite
    off()
    resetLowEndModeForTests()
  })
})
