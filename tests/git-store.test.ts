// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del store de git (multi-repo + mutaciones con puente mockeado).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  subscribeToGit,
  listRepos,
  getActiveRoot,
  getRepoState,
  setActiveRoot,
  detectRepos,
  refreshRepo,
  stagePaths,
  commitChanges,
  _resetGitForTests
} from '../src/renderer/src/services/git/store'

const STATUS_OK =
  '## main...origin/main [ahead 1]\nM  a.ts\n?? b.txt\n'

function mockBridge(handlers: Record<string, (req: never) => unknown>): void {
  const git: Record<string, (req: never) => Promise<unknown>> = {}
  for (const [method, handler] of Object.entries(handlers)) {
    git[method] = async (req: never) => handler(req)
  }
  vi.stubGlobal('window', { api: { git } })
}

beforeEach(() => {
  _resetGitForTests()
  vi.unstubAllGlobals()
})

describe('git store — detección multi-repo', () => {
  it('detecta, activa el workspace si es repo y refresca', async () => {
    mockBridge({
      detectRepos: async () => ({
        ok: true,
        data: [
          { root: '/w', toplevel: '/w' },
          { root: '/w/sub', toplevel: '/w/sub' }
        ]
      }),
      status: async () => ({
        ok: true,
        data: {
          branch: 'main',
          ahead: 1,
          behind: 0,
          upstream: 'origin/main',
          staged: [{ path: 'a.ts', xy: 'M ' }],
          unstaged: [],
          untracked: [{ path: 'b.txt', xy: '??' }]
        }
      }),
      branches: async () => ({ ok: true, data: [] }),
      remotes: async () => ({ ok: true, data: [] })
    })
    const found = await detectRepos('/w')
    expect(found).toHaveLength(2)
    expect(getActiveRoot()).toBe('/w')
    // refreshRepo es async: espera un tick.
    await new Promise((r) => setTimeout(r, 20))
    const state = getRepoState('/w')
    expect(state?.branch).toBe('main')
    expect(state?.staged.map((f) => f.path)).toEqual(['a.ts'])
    expect(STATUS_OK).toContain('main')
  })

  it('workspace sin repo → sin activo', async () => {
    mockBridge({
      detectRepos: async () => ({ ok: true, data: [] })
    })
    await detectRepos('/w')
    expect(listRepos()).toEqual([])
    expect(getActiveRoot()).toBeNull()
  })

  it('setActiveRoot cambia y emite', () => {
    let calls = 0
    const unsub = subscribeToGit(() => calls++)
    mockBridge({
      detectRepos: async () => ({
        ok: true,
        data: [
          { root: '/a', toplevel: '/a' },
          { root: '/b', toplevel: '/b' }
        ]
      }),
      status: async () => ({
        ok: true,
        data: {
          branch: 'x',
          ahead: 0,
          behind: 0,
          upstream: null,
          staged: [],
          unstaged: [],
          untracked: []
        }
      }),
      branches: async () => ({ ok: true, data: [] }),
      remotes: async () => ({ ok: true, data: [] })
    })
    return detectRepos('/a').then(() => {
      setActiveRoot('/b')
      expect(getActiveRoot()).toBe('/b')
      expect(calls).toBeGreaterThan(0)
      unsub()
    })
  })
})

describe('git store — mutaciones', () => {
  beforeEach(() => {
    mockBridge({
      detectRepos: async () => ({ ok: true, data: [{ root: '/w', toplevel: '/w' }] }),
      status: async () => ({
        ok: true,
        data: {
          branch: 'main',
          ahead: 0,
          behind: 0,
          upstream: null,
          staged: [],
          unstaged: [],
          untracked: []
        }
      }),
      branches: async () => ({ ok: true, data: [] }),
      remotes: async () => ({ ok: true, data: [] }),
      stage: async () => ({ ok: true, data: null }),
      commit: async () => ({ ok: true, data: 'ok' }),
      log: async () => ({ ok: true, data: [] }),
      reflog: async () => ({ ok: true, data: { entries: [], deleted: [] } }),
      stashList: async () => ({ ok: true, data: [] }),
      tags: async () => ({ ok: true, data: [] }),
      ghPrList: async () => ({ ok: true, data: [] })
    })
    return detectRepos('/w')
  })

  it('stage + commit refrescan', async () => {
    expect(await stagePaths('/w', ['a.ts'])).toBe(true)
    expect(await commitChanges('/w', 'hola')).toBe(true)
    await refreshRepo('/w')
    expect(getRepoState('/w')?.branch).toBe('main')
  })

  it('fallo retorna false y guarda error', async () => {
    mockBridge({
      stage: async () => ({ ok: false, error: { code: 'failed', message: 'boom' } })
    })
    expect(await stagePaths('/w', ['a.ts'])).toBe(false)
    expect(getRepoState('/w')?.error).toContain('boom')
  })
})
