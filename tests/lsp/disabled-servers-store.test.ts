// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Store de servers apagados (renderer) — persistencia + empuje al main.
 *
 * El manager no tiene storage: la preferencia vive acá y viaja al main al
 * arrancar y en cada cambio. Si el empuje se rompe, el toggle de Ajustes
 * mentiría (se vería apagado y el server seguiría corriendo).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const memory = new Map<string, string>()
const pushed: string[][] = []

vi.stubGlobal('window', {
  localStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key)
  },
  api: {
    lsp: {
      setDisabledServers: async (ids: string[]) => {
        pushed.push([...ids])
        return { ok: true }
      }
    }
  }
})

import {
  _resetDisabledServersForTests,
  getDisabledServers,
  initDisabledServers,
  isServerDisabled,
  setServerDisabled,
  subscribeToDisabledServers
} from '../../src/renderer/src/services/lsp/disabledServers'

beforeEach(() => {
  memory.clear()
  pushed.length = 0
  _resetDisabledServersForTests()
})

describe('servers apagados: store del renderer', () => {
  it('apagar y encender se persiste y se empuja al main', () => {
    setServerDisabled('tsserver', true)
    expect(isServerDisabled('tsserver')).toBe(true)
    expect(getDisabledServers()).toEqual(['tsserver'])

    setServerDisabled('tsserver', false)
    expect(isServerDisabled('tsserver')).toBe(false)
    expect(getDisabledServers()).toEqual([])

    // Dos pushes: al apagar y al encender.
    expect(pushed).toEqual([['tsserver'], []])
  })

  it('un cambio repetido no empuja de nuevo (idempotente)', () => {
    setServerDisabled('alpha', true)
    setServerDisabled('alpha', true)
    expect(pushed).toHaveLength(1)
  })

  it('avisa a los suscriptores para que Ajustes refresque', () => {
    let notifications = 0
    const unsubscribe = subscribeToDisabledServers(() => {
      notifications += 1
    })
    setServerDisabled('alpha', true)
    expect(notifications).toBe(1)
    unsubscribe()
    setServerDisabled('beta', true)
    expect(notifications).toBe(1)
  })

  it('al arrancar se empuja lo que el usuario ya había apagado', () => {
    // Simula el arranque: hay algo persistido y el main todavía no lo sabe.
    setServerDisabled('alpha', true)
    pushed.length = 0

    initDisabledServers()
    expect(pushed).toEqual([['alpha']])
  })
})
