// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El jail de `ext:fs-read`/`ext:fs-write` se validaba solo léxicamente. Un
 * proyecto con `link -> ~/.ssh` dejaba leer/escribir credenciales con permiso
 * `fs.read`. Aquí se prueba el enforcement real del main con symlinks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

const state = vi.hoisted(() => ({ userData: '', home: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => (key === 'userData' ? state.userData : state.home)
  }
}))

const { checkExtensionPathAccess, invalidatePermissionCache, setPermissionWorkspaceRoots } =
  await import('../src/main/extensions/permissions')

let userData: string
let workspace: string
let outside: string

beforeEach(async () => {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-ext-home-'))
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-ext-proj-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-ext-secret-'))
  state.userData = userData
  state.home = userData
  await fs.mkdir(path.join(userData, 'extensions', 'demo'), { recursive: true })
  await fs.writeFile(
    path.join(userData, 'extensions', 'demo', 'manifest.json'),
    JSON.stringify({ id: 'demo', permissions: ['fs.read', 'fs.write'] }),
    'utf-8'
  )
  await fs.writeFile(path.join(outside, 'secret.txt'), 'PRIVATE', 'utf-8')
  await fs.writeFile(path.join(outside, 'id_rsa'), 'PRIVATE KEY', 'utf-8')
  await fs.symlink(outside, path.join(workspace, 'link'))
  setPermissionWorkspaceRoots([workspace])
  invalidatePermissionCache()
})

afterEach(async () => {
  await fs.rm(userData, { recursive: true, force: true })
  await fs.rm(workspace, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

describe('checkExtensionPathAccess — symlinks', () => {
  it('permite leer un archivo normal del workspace', async () => {
    const file = path.join(workspace, 'src', 'a.ts')
    const verdict = await checkExtensionPathAccess('demo', 'read', file)
    expect(verdict.allowed).toBe(true)
  })

  it('deniega leer a través de un symlink que sale del workspace', async () => {
    const verdict = await checkExtensionPathAccess('demo', 'read', path.join(workspace, 'link', 'secret.txt'))
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toContain('symlink')
  })

  it('deniega escribir un destino nuevo a través del symlink', async () => {
    const verdict = await checkExtensionPathAccess(
      'demo',
      'write',
      path.join(workspace, 'link', 'authorized_keys')
    )
    expect(verdict.allowed).toBe(false)
  })

  it('sigue denegando las rutas sensibles aunque estén dentro del workspace', async () => {
    const ssh = path.join(workspace, '.ssh')
    await fs.mkdir(ssh, { recursive: true })
    const verdict = await checkExtensionPathAccess('demo', 'read', path.join(ssh, 'id_rsa'))
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toContain('sensible')
  })
})
