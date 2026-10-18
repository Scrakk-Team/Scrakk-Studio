// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El puente IPC se captura UNA vez al arrancar. El preload ya no deja
 * `window.api` disponible para los bundles de extensión que se importan después.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const bridge = { fs: { readFile: () => 'ok' } }

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('window', {
    __takeApi: () => bridge
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('services/api', () => {
  it('captura el bridge una sola vez', async () => {
    const mod = await import('../src/renderer/src/services/api')
    expect(mod.api).toBe(bridge)
    expect(mod.api.fs).toBe(bridge.fs)
  })

  it('usa el fallback de tests cuando no hay __takeApi', async () => {
    vi.resetModules()
    vi.stubGlobal('window', { api: bridge })
    const mod = await import('../src/renderer/src/services/api')
    expect(mod.api).toBe(bridge)
  })
})
