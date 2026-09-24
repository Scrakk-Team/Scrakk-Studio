// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests de auto-instalación — construcción de comandos, opt-out y dirs
 * gestionados (sin red: no se ejecutan instaladores reales acá).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as fs from 'fs/promises'
import {
  buildInstallCommand,
  downloadsDisabled,
  resolveManagedCommand,
  managedBinDir,
  managedNpmDir
} from '../../src/main/lsp/install'
import { scanWorkspaceExtensions } from '../../src/main/lsp/manager'
import { useScrakkHomeForTests, resetScrakkHome } from '../../src/main/scrakkFolder'
import { makeTempDir, cleanupDir } from '../helpers/lsp-test-utils'

let homeDir: string | undefined
let projectDir: string | undefined

beforeEach(async () => {
  homeDir = await makeTempDir('lsp-install-home-')
  projectDir = await makeTempDir('lsp-install-proj-')
  useScrakkHomeForTests(homeDir)
  delete process.env.SCRAKK_DISABLE_LSP_DOWNLOAD
})

afterEach(async () => {
  resetScrakkHome()
  await cleanupDir(homeDir)
  await cleanupDir(projectDir)
})

describe('buildInstallCommand', () => {
  it('npm instala con --prefix gestionado', () => {
    const cmd = buildInstallCommand({ kind: 'npm', package: 'pyright' })
    expect(cmd.cmd).toBe('npm')
    expect(cmd.args).toEqual(['install', '--prefix', managedNpmDir(), 'pyright'])
  })

  it('go instala con GOBIN en el dir gestionado', () => {
    const cmd = buildInstallCommand({ kind: 'go', package: 'golang.org/x/tools/gopls@latest' })
    expect(cmd.cmd).toBe('go')
    expect(cmd.env?.GOBIN).toBe(managedBinDir())
  })

  it('gem y dotnet arman argv correcto', () => {
    expect(buildInstallCommand({ kind: 'gem', package: 'solargraph' }).args).toEqual(['install', 'solargraph'])
    expect(buildInstallCommand({ kind: 'dotnet', package: 'csharp-ls' }).args).toEqual(['tool', 'install', '-g', 'csharp-ls'])
  })

  it('custom pasa el argv tal cual', () => {
    const cmd = buildInstallCommand({ kind: 'custom', cmd: ['pip', 'install', 'python-lsp-server'] })
    expect(cmd.cmd).toBe('pip')
    expect(cmd.args).toEqual(['install', 'python-lsp-server'])
  })
})

describe('downloadsDisabled (opt-out global)', () => {
  it('respeta SCRAKK_DISABLE_LSP_DOWNLOAD', () => {
    process.env.SCRAKK_DISABLE_LSP_DOWNLOAD = '1'
    expect(downloadsDisabled()).toBe(true)
    process.env.SCRAKK_DISABLE_LSP_DOWNLOAD = '0'
    expect(downloadsDisabled()).toBe(false)
    delete process.env.SCRAKK_DISABLE_LSP_DOWNLOAD
    expect(downloadsDisabled()).toBe(false)
  })
})

describe('resolveManagedCommand', () => {
  it('encuentra binarios en ~/.scrakk/lsp/bin y npm/bin', async () => {
    await fs.mkdir(managedBinDir(), { recursive: true })
    await fs.writeFile(path.join(managedBinDir(), 'myserver'), '#!/bin/sh\n')

    expect(await resolveManagedCommand('myserver')).toBe(path.join(managedBinDir(), 'myserver'))
    expect(await resolveManagedCommand('nope')).toBeNull()
  })
})

describe('scanWorkspaceExtensions (gate de instalación)', () => {
  it('detecta extensiones presentes y salta carpetas ruido', async () => {
    await fs.mkdir(path.join(projectDir!, 'node_modules', 'x'), { recursive: true })
    await fs.writeFile(path.join(projectDir!, 'node_modules', 'x', 'junk.mockts'), '')
    await fs.mkdir(path.join(projectDir!, 'src'), { recursive: true })
    await fs.writeFile(path.join(projectDir!, 'src', 'app.py'), '')

    const found = await scanWorkspaceExtensions(projectDir!)
    expect(found).not.toBeNull()
    // node_modules NO se escanea → .mockts ausente; .py presente.
    expect(found!.has('.py')).toBe(true)
    expect(found!.has('.mockts')).toBe(false)
  })
})
