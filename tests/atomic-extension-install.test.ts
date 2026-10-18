// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Instalación atómica (issue #13): una actualización fallida nunca debe dejar
 * al usuario sin la versión anterior ni con una carpeta a medio escribir.
 *
 * Filesystem real: mocks no reproducen `rename` ni `ENOTDIR`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { atomicInstall, cleanupStaleInstalls } from '../src/main/extensions/atomicInstall'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-atomic-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const files = (entries: Record<string, string>): Array<[string, string]> => Object.entries(entries)

async function install(id: string, entries: Record<string, string>) {
  return atomicInstall({ root, id, files: files(entries) })
}

async function text(file: string): Promise<string> {
  return fs.readFile(file, 'utf-8')
}

async function residues(): Promise<string[]> {
  return (await fs.readdir(root)).filter((name) => /^\.(staging|backup)-/.test(name))
}

describe('atomicInstall', () => {
  it('instala desde cero', async () => {
    const result = await install('demo', { 'manifest.json': '{"id":"demo"}', 'dist/index.js': 'x' })
    expect(result.written).toBe(2)
    expect(await text(path.join(root, 'demo', 'manifest.json'))).toContain('demo')
    expect(await residues()).toEqual([])
  })

  it('actualiza y elimina archivos viejos en el mismo swap', async () => {
    await install('demo', { 'manifest.json': 'v1', 'old.txt': 'stale' })
    await install('demo', { 'manifest.json': 'v2', 'new.txt': 'fresh' })
    expect(await text(path.join(root, 'demo', 'manifest.json'))).toBe('v2')
    await expect(fs.access(path.join(root, 'demo', 'new.txt'))).resolves.toBeUndefined()
    await expect(fs.access(path.join(root, 'demo', 'old.txt'))).rejects.toThrow()
  })

  it('un fallo a mitad de escritura deja la versión anterior intacta', async () => {
    await install('demo', { 'manifest.json': 'v1', 'keep.txt': 'keep' })

    function* broken(): Generator<[string, string]> {
      yield ['manifest.json', 'v2']
      throw new Error('disk full')
    }
    await expect(atomicInstall({ root, id: 'demo', files: broken() })).rejects.toThrow('disk full')

    expect(await text(path.join(root, 'demo', 'manifest.json'))).toBe('v1')
    expect(await text(path.join(root, 'demo', 'keep.txt'))).toBe('keep')
    expect(await residues()).toEqual([])
  })

  it('un paquete vacío no reemplaza la instalación existente', async () => {
    await install('demo', { 'manifest.json': 'v1' })
    await expect(atomicInstall({ root, id: 'demo', files: [] })).rejects.toThrow(/no contiene/)
    expect(await text(path.join(root, 'demo', 'manifest.json'))).toBe('v1')
    expect(await residues()).toEqual([])
  })

  it('ignora entradas que escapan del destino', async () => {
    await install('demo', {
      'ok.txt': 'ok',
      '../evil.txt': 'evil',
      '/abs.txt': 'evil',
      'a/../../evil.txt': 'evil',
      '..\\evil.txt': 'evil'
    })
    expect(await text(path.join(root, 'demo', 'ok.txt'))).toBe('ok')
    await expect(fs.access(path.join(root, 'evil.txt'))).rejects.toThrow()
    await expect(fs.access(path.join(root, 'demo', '..', 'evil.txt'))).rejects.toThrow()
  })

  it('escribe sidecars en la misma unidad atómica', async () => {
    await atomicInstall({
      root,
      id: 'demo',
      files: [['manifest.json', '{}']],
      extraFiles: { '.market.json': '{"slug":"demo"}' }
    })
    expect(await text(path.join(root, 'demo', '.market.json'))).toContain('demo')
  })

  it('rechaza ids inválidos', async () => {
    await expect(install('../evil', { 'a.txt': 'x' })).rejects.toThrow(/Id de extensión/)
  })

  it('limpia staging y borra backups huérfanos', async () => {
    await fs.mkdir(path.join(root, '.staging-demo-1'))
    await fs.mkdir(path.join(root, '.backup-demo-1'))
    await install('demo', { 'manifest.json': 'current' })
    await fs.mkdir(path.join(root, '.backup-demo-1700000000000-abcdef12'))
    await fs.writeFile(path.join(root, '.backup-demo-1700000000000-abcdef12', 'old'), 'old')
    await fs.writeFile(path.join(root, '.staging-demo-1', 'left'), 'x')

    expect(await cleanupStaleInstalls(root)).toBe(3)
    expect(await residues()).toEqual([])
    expect(await text(path.join(root, 'demo', 'manifest.json'))).toBe('current')
  })

  it('restaura un backup si el destino desapareció (swap a medias)', async () => {
    const backup = path.join(root, '.backup-demo-1700000000000-abcdef12')
    await fs.mkdir(backup)
    await fs.writeFile(path.join(backup, 'manifest.json'), 'old')
    await cleanupStaleInstalls(root)
    expect(await text(path.join(root, 'demo', 'manifest.json'))).toBe('old')
  })
})
