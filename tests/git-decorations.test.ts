// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del mapper git → decoraciones + registry de decoraciones.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { gitFileDecoration } from '../src/renderer/src/services/git/decorations'
import { toRepoRel } from '../src/renderer/src/services/git/decorations'
import {
  registerFileDecorationProvider,
  getFileDecoration,
  refreshFileDecorations,
  subscribeToDecorations,
  _resetDecorationsForTests
} from '../src/renderer/src/features/explorer/decorations'

const STATUS = {
  staged: [{ path: 'a.ts', xy: 'M ' }],
  unstaged: [{ path: 'b.ts', xy: ' M' }],
  untracked: [{ path: 'c.txt', xy: '??' }]
}

describe('gitFileDecoration', () => {
  it('staged manda con su letra y tooltip', () => {
    expect(gitFileDecoration(STATUS, 'a.ts')).toMatchObject({ badge: 'M' })
  })

  it('unstaged usa la segunda columna', () => {
    expect(gitFileDecoration(STATUS, 'b.ts')).toMatchObject({ badge: 'M' })
  })

  it('untracked → U', () => {
    expect(gitFileDecoration(STATUS, 'c.txt')).toMatchObject({ badge: 'U' })
  })

  it('limpio → null', () => {
    expect(gitFileDecoration(STATUS, 'z.ts')).toBeNull()
    expect(
      gitFileDecoration({ staged: [], unstaged: [], untracked: [] }, 'a.ts')
    ).toBeNull()
  })

  it('renombre matchea origen también', () => {
    const status = {
      staged: [{ path: 'nuevo.ts', xy: 'R ', origPath: 'viejo.ts' }],
      unstaged: [],
      untracked: []
    }
    expect(gitFileDecoration(status, 'viejo.ts')).toMatchObject({ badge: 'R' })
    expect(gitFileDecoration(status, 'nuevo.ts')).toMatchObject({ badge: 'R' })
  })
})

describe('toRepoRel', () => {
  it('absoluto → relativo, fuera → null', () => {
    expect(toRepoRel('/r', '/r/a/f.ts')).toBe('a/f.ts')
    expect(toRepoRel('/r/', '/r/f.ts')).toBe('f.ts')
    expect(toRepoRel('/r', '/otro/f.ts')).toBeNull()
    expect(toRepoRel('/r', '/r')).toBe('')
  })
})

describe('decorations registry', () => {
  beforeEach(() => {
    _resetDecorationsForTests()
  })

  it('sin proveedores → null', () => {
    expect(getFileDecoration('/x')).toBeNull()
  })

  it('primero registrado manda; unsubscribe retira', () => {
    const unsubA = registerFileDecorationProvider((p) =>
      p.endsWith('.ts') ? { badge: 'T' } : null
    )
    registerFileDecorationProvider(() => ({ badge: 'B' }))
    expect(getFileDecoration('/a.ts')).toMatchObject({ badge: 'T' })
    expect(getFileDecoration('/a.md')).toMatchObject({ badge: 'B' })
    unsubA()
    expect(getFileDecoration('/a.ts')).toMatchObject({ badge: 'B' })
  })

  it('proveedor roto no tumba; refresh emite', () => {
    registerFileDecorationProvider(() => {
      throw new Error('boom')
    })
    expect(getFileDecoration('/a')).toBeNull()
    let calls = 0
    const unsub = subscribeToDecorations(() => calls++)
    refreshFileDecorations()
    expect(calls).toBe(1)
    unsub()
  })
})
