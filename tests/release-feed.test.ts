// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Regresión del auto-update de Windows: `latest.yml` nombraba un asset
 * distinto al publicado (404). El verificador recibe un directorio de release
 * y comprueba que cada URL/path exista.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { parseUpdateFeed, verifyReleaseDir } from '../tools/verify-release-feed.mjs'

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-feed-'))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const feed = (name: string): string => `version: 1.2.3
files:
  - url: ${name}
    sha512: abc
    size: 10
path: ${name}
sha512: abc
releaseDate: '2026-10-17T00:00:00.000Z'
`

describe('parseUpdateFeed', () => {
  it('extrae version, path y files[].url', () => {
    const parsed = parseUpdateFeed(feed('Scrakk-Studio-Setup-1.2.3.exe'))
    expect(parsed.version).toBe('1.2.3')
    expect(parsed.path).toBe('Scrakk-Studio-Setup-1.2.3.exe')
    expect(parsed.targets).toEqual(['Scrakk-Studio-Setup-1.2.3.exe'])
  })
})

describe('verifyReleaseDir', () => {
  it('acepta un feed cuyos archivos existen', async () => {
    await fs.writeFile(path.join(dir, 'latest.yml'), feed('Scrakk-Studio-Setup-1.2.3.exe'))
    await fs.writeFile(path.join(dir, 'Scrakk-Studio-Setup-1.2.3.exe'), 'x')
    expect(verifyReleaseDir(dir)).toMatchObject({ ok: true, feeds: ['latest.yml'] })
  })

  it('detecta el bug real: el nombre del feed no coincide con el asset', async () => {
    await fs.writeFile(path.join(dir, 'latest.yml'), feed('Scrakk-Studio-Setup-1.0.0.exe'))
    await fs.writeFile(path.join(dir, 'Scrakk.Studio.Setup.1.0.0.exe'), 'x')
    const result = verifyReleaseDir(dir)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/Scrakk-Studio-Setup-1\.0\.0\.exe/)
  })

  it('falla si no hay latest*.yml', () => {
    const result = verifyReleaseDir(dir)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/No hay latest/)
  })

  it('soporta nombres URL-encoded', async () => {
    await fs.writeFile(path.join(dir, 'latest-linux.yml'), feed('Scrakk%20Studio%201.2.3.AppImage'))
    await fs.writeFile(path.join(dir, 'Scrakk Studio 1.2.3.AppImage'), 'x')
    expect(verifyReleaseDir(dir).ok).toBe(true)
  })
})
