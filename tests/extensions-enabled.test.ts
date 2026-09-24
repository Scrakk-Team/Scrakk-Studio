// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del estado enabled/disabled de extensiones:
 * - Default activado, desactivar persiste meta, reactivar olvida.
 * - Reactividad vía subscribe.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  isExtensionEnabled,
  enableExtension,
  disableExtension,
  getDisabledExtensions,
  subscribeToEnabled,
  hydrateEnabled,
  resetEnabledForTests
} from '@services/extensions/enabled'

const META = {
  id: 'carbon',
  name: 'Carbon Product Icons',
  version: '1.0.0',
  author: 'antfu',
  isBuiltin: false
}

beforeEach(() => {
  resetEnabledForTests()
})

describe('enabled', () => {
  it('todo activado por defecto', () => {
    expect(isExtensionEnabled('cualquier-id')).toBe(true)
    expect(getDisabledExtensions()).toEqual([])
  })

  it('desactivar guarda meta y persiste', () => {
    disableExtension(META)
    expect(isExtensionEnabled('carbon')).toBe(false)
    expect(isExtensionEnabled('otra')).toBe(true)
    expect(getDisabledExtensions()).toEqual([META])
  })

  it('reactivar olvida el estado', () => {
    disableExtension(META)
    enableExtension('carbon')
    expect(isExtensionEnabled('carbon')).toBe(true)
    expect(getDisabledExtensions()).toEqual([])
  })

  it('reactivar inexistente es no-op', () => {
    expect(() => enableExtension('fantasma')).not.toThrow()
  })

  it('emite cambios a suscriptores', () => {
    let calls = 0
    const off = subscribeToEnabled(() => calls++)
    disableExtension(META)
    enableExtension('carbon')
    off()
    disableExtension(META)
    expect(calls).toBe(2)
  })

  it('hydrateEnabled restaura lo persistido', () => {
    disableExtension(META)
    // Simula reload: re-hidrata (el fallback en memoria conserva el JSON).
    hydrateEnabled()
    expect(isExtensionEnabled('carbon')).toBe(false)
    expect(getDisabledExtensions()).toEqual([META])
  })
})
