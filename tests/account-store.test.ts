// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Test del store multi-cuenta del main (aislado: mockea electron).
 *
 * Cubre el caso que rompía en Linux: `safeStorage` no disponible (keyring no
 * lista) → antes se perdía la sesión al reiniciar; ahora persiste igual.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
  const fs = require('node:fs') as typeof import('node:fs')
  const os = require('node:os') as typeof import('node:os')
  const path = require('node:path') as typeof import('node:path')
  return {
    testDir: fs.mkdtempSync(path.join(os.tmpdir(), 'scrakk-acc-')),
    state: { available: true }
  }
})

vi.mock('electron', () => ({
  app: { getPath: () => h.testDir },
  safeStorage: {
    isEncryptionAvailable: () => h.state.available,
    encryptString: (s: string) => Buffer.from('enc:' + s, 'utf-8'),
    decryptString: (b: Buffer) => {
      const text = b.toString('utf-8')
      if (!text.startsWith('enc:')) throw new Error('not encrypted')
      return text.slice(4)
    }
  }
}))

import {
  clearAll,
  getAccount,
  getActiveId,
  listAccountSummaries,
  removeAccount,
  setActive,
  upsertAccount
} from '../src/main/account/session'

function profile(id: string, email: string) {
  return { id, email, handle: null, displayName: null, avatarUrl: null, bio: null }
}

describe('store multi-cuenta', () => {
  beforeEach(() => {
    clearAll()
    h.state.available = true
  })

  it('guarda varias cuentas y la última queda default', () => {
    upsertAccount(profile('u1', 'a@x.com'), { accessToken: 'a1', refreshToken: 'r1' })
    upsertAccount(profile('u2', 'b@x.com'), { accessToken: 'a2', refreshToken: 'r2' })

    expect(getActiveId()).toBe('u2')
    expect(listAccountSummaries().map((a) => a.id).sort()).toEqual(['u1', 'u2'])
    expect(getAccount('u1')?.accessToken).toBe('a1')
    expect(getAccount('u2')?.accessToken).toBe('a2')
  })

  it('setActive cambia el default sin perder las otras', () => {
    upsertAccount(profile('u1', 'a@x.com'), { accessToken: 'a1', refreshToken: 'r1' })
    upsertAccount(profile('u2', 'b@x.com'), { accessToken: 'a2', refreshToken: 'r2' })

    expect(setActive('u1')).toBe(true)
    expect(getActiveId()).toBe('u1')
    expect(listAccountSummaries()).toHaveLength(2)
  })

  it('setActive ignora cuentas inexistentes', () => {
    upsertAccount(profile('u1', 'a@x.com'), { accessToken: 'a1', refreshToken: 'r1' })
    expect(setActive('nope')).toBe(false)
    expect(getActiveId()).toBe('u1')
  })

  it('removeAccount borra y reasigna el default', () => {
    upsertAccount(profile('u1', 'a@x.com'), { accessToken: 'a1', refreshToken: 'r1' })
    upsertAccount(profile('u2', 'b@x.com'), { accessToken: 'a2', refreshToken: 'r2' })

    expect(removeAccount('u2')).toBe('u1')
    expect(listAccountSummaries().map((a) => a.id)).toEqual(['u1'])
    expect(getActiveId()).toBe('u1')
  })

  it('persiste aunque safeStorage NO esté disponible (Linux/keyring)', () => {
    h.state.available = false
    upsertAccount(profile('u1', 'a@x.com'), { accessToken: 'a1', refreshToken: 'r1' })

    // Se lee de nuevo (simula reinicio) sin cifrado disponible.
    expect(getActiveId()).toBe('u1')
    expect(getAccount('u1')?.accessToken).toBe('a1')

    // Y si el cifrado vuelve a estar disponible, igual se lee.
    h.state.available = true
    expect(getAccount('u1')?.refreshToken).toBe('r1')
  })
})
