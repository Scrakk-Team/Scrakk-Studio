/**
 * Resolución de ejecutables y rutas de procesos hijos (main).
 *
 * Estos tres módulos existen por un bug de entorno, no de lógica: la app
 * lanzada desde el menú tiene un PATH distinto al de una terminal, y los scripts
 * de los procesos hijos no pueden vivir dentro del asar. Los tests cubren las
 * decisiones que se equivocaron ANTES (versión de node elegida alfabéticamente,
 * deduplicación del PATH, ruta desempacada), no el file system de quien corre.
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { augmentedPath, extraBinDirs, isExecutableFile, resolveExecutable } from '../src/main/binaries'
import { resolveSpawnEntry } from '../src/main/spawnEntry'

const tempDirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'scrakk-binaries-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('augmentedPath', () => {
  it('deja el PATH del proceso primero y suma los directorios extra que existen', () => {
    const home = tempDir()
    const extra = join(home, '.local', 'bin')
    mkdirSync(extra, { recursive: true })

    const result = augmentedPath('/usr/bin:/bin', {}, home, 'linux').split(':')
    expect(result.slice(0, 2)).toEqual(['/usr/bin', '/bin'])
    expect(result).toContain(extra)
  })

  it('no duplica entradas ya presentes en el PATH', () => {
    const result = augmentedPath('/usr/bin', {}, '/home/nadie', 'linux')
    expect(result.split(':').filter((dir) => dir === '/usr/bin')).toHaveLength(1)
  })

  it('ignora directorios que no existen (un PATH con rutas muertas miente)', () => {
    const home = tempDir()
    const result = augmentedPath('/usr/bin', {}, home, 'linux')
    expect(result).not.toContain(join(home, '.local', 'bin'))
    expect(result).not.toContain(join(home, '.volta', 'bin'))
  })

  it('elige la versión de node MÁS ALTA, no la última alfabética (v9 vs v20)', () => {
    const home = tempDir()
    mkdirSync(join(home, '.nvm', 'versions', 'node', 'v9.11.2', 'bin'), { recursive: true })
    mkdirSync(join(home, '.nvm', 'versions', 'node', 'v20.11.0', 'bin'), { recursive: true })

    const dirs = extraBinDirs({}, home, 'linux')
    expect(dirs).toContain(join(home, '.nvm', 'versions', 'node', 'v20.11.0', 'bin'))
    expect(dirs).not.toContain(join(home, '.nvm', 'versions', 'node', 'v9.11.2', 'bin'))
  })

  it('reconoce el layout de fnm (`<v>/installation/bin`)', () => {
    const home = tempDir()
    const bin = join(home, '.local', 'share', 'fnm', 'node-versions', 'v22.4.0', 'installation', 'bin')
    mkdirSync(bin, { recursive: true })

    expect(augmentedPath('/usr/bin', {}, home, 'linux')).toContain(bin)
  })
})

describe('resolveExecutable', () => {
  it('encuentra un ejecutable en un directorio extra del PATH', () => {
    const home = tempDir()
    const bin = join(home, '.local', 'bin')
    mkdirSync(bin, { recursive: true })
    const target = join(bin, 'npm')
    writeFileSync(target, '#!/bin/sh\n')
    chmodSync(target, 0o755)

    expect(resolveExecutable('npm', { PATH: '/usr/bin' }, 'linux', home)).toBe(target)
  })

  it('devuelve null cuando no está (en vez de un ENOENT río abajo)', () => {
    expect(
      resolveExecutable('no-existe-jamas', { PATH: tempDir() }, 'linux', tempDir())
    ).toBeNull()
  })

  it('acepta una ruta absoluta y verifica que sea ejecutable', () => {
    const dir = tempDir()
    const script = join(dir, 'server')
    writeFileSync(script, '#!/bin/sh\n')
    chmodSync(script, 0o755)
    const plain = join(dir, 'no-exec')
    writeFileSync(plain, '')

    expect(resolveExecutable(script)).toBe(script)
    expect(resolveExecutable(plain)).toBeNull()
    expect(isExecutableFile(script)).toBe(true)
  })

  it('sigue un symlink del PATH (como hace el propio shell)', () => {
    const dir = tempDir()
    const real = join(dir, 'node-v22')
    writeFileSync(real, '#!/bin/sh\n')
    chmodSync(real, 0o755)
    const link = join(dir, 'node')
    symlinkSync(real, link)

    expect(resolveExecutable('node', { PATH: dir }, 'linux', dir)).toBe(link)
  })
})

describe('resolveSpawnEntry', () => {
  it('devuelve la ruta de al lado del bundle cuando no hay asar', () => {
    const base = join(tempDir(), 'out', 'main')
    expect(resolveSpawnEntry('tree-sitter-worker.js', base)).toBe(
      join(base, 'tree-sitter-worker.js')
    )
  })

  it('prefiere app.asar.unpacked cuando existe (proceso hijo ejecutable)', () => {
    const root = tempDir()
    const unpacked = join(root, 'app.asar.unpacked', 'out', 'main')
    mkdirSync(unpacked, { recursive: true })
    writeFileSync(join(unpacked, 'extension-host.js'), '// host')

    const packed = join(root, 'app.asar', 'out', 'main')
    expect(resolveSpawnEntry('extension-host.js', packed)).toBe(
      join(unpacked, 'extension-host.js')
    )
  })

  it('cae a la ruta del asar si el archivo no está desempacado', () => {
    const root = tempDir()
    const packed = join(root, 'app.asar', 'out', 'main')
    expect(resolveSpawnEntry('tree-sitter-worker.js', packed)).toBe(
      join(packed, 'tree-sitter-worker.js')
    )
  })
})
