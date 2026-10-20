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

/** Se arma con separadores nativos: en Windows `app.asar\\` es `app.asar\`. */
const ROOT = path.resolve('/opt/scrakk/resources')
const ASAR = path.join(ROOT, 'app.asar')
const HERE = path.join(ASAR, 'out', 'main')
const UNPACKED = path.join(ROOT, 'app.asar.unpacked', 'out', 'main')
const CWD = path.resolve('/home/dev/clon-malicioso')

describe('nativeSearchDirs', () => {
  it('busca en el checkout de la app y en app.asar.unpacked', () => {
    const dirs = nativeSearchDirs(HERE)
    expect(dirs).toContain(UNPACKED)
    expect(dirs).toContain(path.join(HERE, '../../native/search'))
  })

  it('solo deriva rutas de __dirname (no del cwd del proceso)', () => {
    const dirs = nativeSearchDirs(HERE)
    expect(dirs).not.toContain(path.join(CWD, 'native/search'))
    expect(dirs.every((dir) => dir.startsWith(ASAR))).toBe(true)
  })
})

describe('kolargrepDirs', () => {
  it('incluye resourcesPath y el checkout de desarrollo', () => {
    const dirs = kolargrepDirs(HERE, ROOT)
    // Tal cual: no se resuelve ni se normaliza (es lo que recibe Electron).
    expect(dirs[0]).toBe(ROOT)
    expect(dirs).toContain(path.join(HERE, '../../native/kolargrep/target/release'))
  })

  it('solo deriva rutas de __dirname y resourcesPath', () => {
    const dirs = kolargrepDirs(HERE, ROOT)
    expect(dirs).not.toContain(path.join(CWD, 'native/kolargrep/target/release'))
  })
})
