// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El jail de `.scrakk` y el de extensiones se validaban solo léxicamente.
 * Un repo puede commitear `.scrakk/data -> ~/.ssh`; `data/id_rsa` empieza por
 * la raíz y el check antiguo lo permitía. Estos tests usan symlinks reales.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { readText, writeText } from '../src/main/scrakk/fs'
import { isRealPathInsideAny } from '../src/main/extensions/realpathJail'

let project: string
let outside: string

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-jail-proj-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-jail-secret-'))
  await fs.mkdir(path.join(project, '.scrakk'), { recursive: true })
  await fs.writeFile(path.join(outside, 'id_rsa'), 'PRIVATE KEY', 'utf-8')
  await fs.symlink(outside, path.join(project, '.scrakk', 'data'))
})

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

const op = (relative: string) => ({ scope: 'project' as const, projectRoot: project, relative })

describe('scrakk/fs — jail con symlinks', () => {
  it('lee archivos normales dentro de .scrakk', async () => {
    await fs.writeFile(path.join(project, '.scrakk', 'ok.json'), '{}', 'utf-8')
    const result = await readText(op('ok.json'))
    expect(result).toEqual({ ok: true, data: '{}' })
  })

  it('rechaza leer a través de un symlink que sale de la raíz', async () => {
    const result = await readText(op('data/id_rsa'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('fuera de .scrakk')
  })

  it('rechaza escribir a través de un symlink que sale de la raíz', async () => {
    const result = await writeText({ ...op('data/authorized_keys'), content: 'ssh-rsa evil' })
    expect(result.ok).toBe(false)
    await expect(fs.access(path.join(outside, 'authorized_keys'))).rejects.toThrow()
  })

  it('rechaza borrar el contenido de un symlink externo', async () => {
    // `resolveInside` no permite borrar la raíz, pero sí `data/…`.
    const { removeEntry } = await import('../src/main/scrakk/fs')
    const result = await removeEntry(op('data/id_rsa'))
    expect(result.ok).toBe(false)
    await expect(fs.access(path.join(outside, 'id_rsa'))).resolves.toBeUndefined()
  })
})

describe('isRealPathInsideAny', () => {
  it('acepta una ruta real dentro y rechaza el escape por symlink', async () => {
    expect(await isRealPathInsideAny([project], path.join(project, '.scrakk', 'ok.json'))).toBe(true)
    expect(await isRealPathInsideAny([project], path.join(project, '.scrakk', 'data', 'id_rsa'))).toBe(
      false
    )
  })

  it('tolera destinos que todavía no existen dentro del root', async () => {
    expect(
      await isRealPathInsideAny([project], path.join(project, '.scrakk', 'nuevo', 'archivo.json'))
    ).toBe(true)
  })
})
