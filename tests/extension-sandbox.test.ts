// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sandbox del Extension Host: construcción de `execArgv` y verificación real
 * del modelo de permisos de Node (fs y child_process).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildSandboxPolicy, supportsPermissionModel } from '../src/main/extensions/sandbox'
import { buildNetworkSandbox } from '../src/main/extensions/osSandbox'

const run = promisify(execFile)

const base = {
  extensionPath: '/opt/ext',
  workspaceRoots: ['/home/dev/project'],
  storage: {
    globalStorage: '/home/dev/.config/scrakk/global',
    workspaceStorage: '/home/dev/.config/scrakk/ws',
    logs: '/home/dev/.config/scrakk/logs'
  },
  appRoot: '/opt/scrakk/resources/app.asar',
  hostEntry: '/opt/scrakk/resources/app.asar.unpacked/out/main/extension-host.js',
  resourcesPath: '/opt/scrakk/resources',
  homeDir: '/home/dev'
}

function flags(policy: ReturnType<typeof buildSandboxPolicy>): Set<string> {
  return new Set(policy.execArgv)
}

function prefixes(policy: ReturnType<typeof buildSandboxPolicy>, prefix: string): string[] {
  return policy.execArgv.filter((arg) => arg.startsWith(prefix))
}

describe('buildSandboxPolicy', () => {
  it('sin permisos: lee la app y su storage, pero no el workspace ni spawnear', () => {
    const policy = buildSandboxPolicy({ ...base, permissions: [] })
    expect(policy.driver).toBe('node-permission')
    expect(flags(policy)).toContain('--permission')
    expect(flags(policy)).not.toContain('--allow-child-process')
    expect(prefixes(policy, '--allow-fs-read=')).toContain('--allow-fs-read=/opt/ext')
    expect(prefixes(policy, '--allow-fs-read=')).not.toContain(
      '--allow-fs-read=/home/dev/project'
    )
    expect(prefixes(policy, '--allow-fs-write=')).not.toContain(
      '--allow-fs-write=/home/dev/project'
    )
  })

  it('fs.read habilita lectura del workspace, no escritura', () => {
    const policy = buildSandboxPolicy({ ...base, permissions: ['fs.read'] })
    expect(prefixes(policy, '--allow-fs-read=')).toContain(
      '--allow-fs-read=/home/dev/project'
    )
    expect(prefixes(policy, '--allow-fs-write=')).not.toContain(
      '--allow-fs-write=/home/dev/project'
    )
  })

  it('fs.write habilita escritura del workspace', () => {
    const policy = buildSandboxPolicy({ ...base, permissions: ['fs.write'] })
    expect(prefixes(policy, '--allow-fs-write=')).toContain(
      '--allow-fs-write=/home/dev/project'
    )
  })

  it('shell.exec es lo único que habilita child_process', () => {
    const without = buildSandboxPolicy({ ...base, permissions: ['fs.read', 'network.fetch'] })
    expect(flags(without)).not.toContain('--allow-child-process')
    const withShell = buildSandboxPolicy({ ...base, permissions: ['shell.exec'] })
    expect(flags(withShell)).toContain('--allow-child-process')
  })

  it('fs.all agrega el home (lectura y escritura)', () => {
    const policy = buildSandboxPolicy({ ...base, permissions: ['fs.all'] })
    expect(prefixes(policy, '--allow-fs-read=')).toContain('--allow-fs-read=/home/dev')
    expect(prefixes(policy, '--allow-fs-write=')).toContain('--allow-fs-write=/home/dev')
  })

  it('no permite addons ni WASI', () => {
    const policy = buildSandboxPolicy({ ...base, permissions: ['fs.all', 'shell.exec'] })
    expect(flags(policy)).not.toContain('--allow-addons')
    expect(flags(policy)).not.toContain('--allow-wasi')
  })

  it('se puede desactivar por entorno', () => {
    const policy = buildSandboxPolicy({ ...base, permissions: [], enabled: false })
    expect(policy.driver).toBe('none')
    expect(policy.execArgv).toEqual([])
  })
})

describe('supportsPermissionModel', () => {
  it('detecta el flag sin hardcodear la versión', () => {
    expect(supportsPermissionModel(new Set(['--permission']))).toBe(true)
    expect(supportsPermissionModel(new Set(['--experimental-permission']))).toBe(false)
  })
})

describe.skipIf(!supportsPermissionModel())('Node permission model (integración)', () => {
  it('bloquea /etc/passwd y child_process, pero permite el propio archivo', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-sandbox-'))
    const script = path.join(dir, 'probe.cjs')
    await fs.writeFile(
      script,
      `
      const fs = require('fs')
      try { fs.readFileSync('/etc/passwd'); console.log('READ_OK') }
      catch (e) { console.log('READ_BLOCKED', e.code) }
      try { require('child_process').execSync('echo hi'); console.log('CP_OK') }
      catch (e) { console.log('CP_BLOCKED', e.code) }
      try { fs.readFileSync(__filename); console.log('SELF_OK') }
      catch (e) { console.log('SELF_BLOCKED', e.code) }
      `,
      'utf-8'
    )
    try {
      const { stdout } = await run(
        process.execPath,
        ['--permission', `--allow-fs-read=${script}`, script],
        { timeout: 10_000 }
      )
      expect(stdout).toContain('READ_BLOCKED')
      expect(stdout).toContain('CP_BLOCKED')
      expect(stdout).toContain('SELF_OK')
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})


describe('buildNetworkSandbox (bwrap)', () => {
  it('no envuelve si la extensión declara network.fetch', () => {
    expect(
      buildNetworkSandbox({ enabled: false, writePaths: [], platform: 'linux', bwrap: 'bwrap' })
    ).toBeNull()
  })

  it('solo aplica en Linux y si bwrap está disponible', () => {
    expect(
      buildNetworkSandbox({ enabled: true, writePaths: [], platform: 'win32', bwrap: 'bwrap' })
    ).toBeNull()
    expect(
      buildNetworkSandbox({ enabled: true, writePaths: [], platform: 'linux', bwrap: null })
    ).toBeNull()
  })

  it('aisla la red y re-bindea solo las rutas de escritura existentes', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-bwrap-'))
    try {
      const sandbox = buildNetworkSandbox({
        enabled: true,
        writePaths: [dir],
        platform: 'linux',
        bwrap: '/usr/bin/bwrap'
      })
      expect(sandbox?.driver).toBe('bwrap')
      expect(sandbox?.args).toContain('--unshare-net')
      expect(sandbox?.args).toEqual(
        expect.arrayContaining(['--bind', dir, dir])
      )
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
