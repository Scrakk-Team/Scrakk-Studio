// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Los binarios nativos se cargan/ejecutan con los privilegios del proceso
 * main. Si `process.cwd()` entrara en la lista, abrir el IDE desde un repo
 * malicioso ejecutaría el `.node`/`kolargrep` que ese repo traiga.
 */

import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import { kolargrepDirs, nativeSearchDirs } from '../src/main/search/nativePaths'

const HERE = '/opt/scrakk/resources/app.asar/out/main'
const CWD = '/home/dev/clon-malicioso'

describe('nativeSearchDirs', () => {
  it('busca en el checkout de la app y en app.asar.unpacked', () => {
    const dirs = nativeSearchDirs(HERE)
    expect(dirs).toContain(path.resolve('/opt/scrakk/resources/app.asar.unpacked/out/main'))
    expect(dirs).toContain(path.resolve(HERE, '../../native/search'))
  })

  it('solo deriva rutas de __dirname (no del cwd del proceso)', () => {
    const dirs = nativeSearchDirs(HERE)
    expect(dirs).not.toContain(path.resolve(CWD, 'native/search'))
    expect(dirs.every((dir) => dir.startsWith(path.resolve('/opt/scrakk/resources/app.asar')))).toBe(true)
  })
})

describe('kolargrepDirs', () => {
  it('incluye resourcesPath y el checkout de desarrollo', () => {
    const dirs = kolargrepDirs(HERE, '/opt/scrakk/resources')
    expect(dirs[0]).toBe(path.resolve('/opt/scrakk/resources'))
    expect(dirs).toContain(path.resolve(HERE, '../../native/kolargrep/target/release'))
  })

  it('solo deriva rutas de __dirname y resourcesPath', () => {
    const dirs = kolargrepDirs(HERE, '/opt/scrakk/resources')
    expect(dirs).not.toContain(path.resolve(CWD, 'native/kolargrep/target/release'))
  })
})
