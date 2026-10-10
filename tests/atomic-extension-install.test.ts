// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests de la instalación atómica de extensiones.
 *
 * Van contra un filesystem REAL en un directorio temporal, no contra mocks: lo
 * que hay que verificar son las garantías de `rename` entre directorios, que un
 * mock no reproduce. Cada caso inyecta el fallo en el punto donde el patrón
 * anterior perdía la instalación.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import {
  installExtensionAtomically,
  cleanupStaleInstalls,
  resolveInsideDir
} from '../src/main/extensions/atomicInstall'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-atomic-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true }).catch(() => {})
})

function pkg(version: string, extra: Record<string, string> = {}): Map<string, string> {
  const files = new Map<string, string>([
    ['manifest.json', JSON.stringify({ id: 'mi-ext', version })],
    ['dist/index.js', `// versión ${version}`]
  ])
  for (const [name, body] of Object.entries(extra)) files.set(name, body)
  return files
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf-8')
  } catch {
    return null
  }
}

async function listing(dir: string): Promise<string[]> {
  return (await fs.readdir(dir)).sort()
}

describe('installExtensionAtomically — instalación nueva', () => {
  it('deja los archivos en el destino', async () => {
    const dir = await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('1.0.0') })

    expect(dir).toBe(path.join(root, 'mi-ext'))
    expect(await readIfExists(path.join(dir, 'manifest.json'))).toContain('"version":"1.0.0"')
    expect(await readIfExists(path.join(dir, 'dist/index.js'))).toBe('// versión 1.0.0')
  })

  it('no deja restos de staging ni de backup', async () => {
    await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('1.0.0') })
    expect(await listing(root)).toEqual(['mi-ext'])
  })

  it('el sidecar se escribe dentro de la instalación', async () => {
    const dir = await installExtensionAtomically({
      root,
      id: 'mi-ext',
      files: pkg('1.0.0'),
      sidecar: async (staging) => {
        await fs.writeFile(path.join(staging, '.source.json'), '{"source":"vscode"}')
      }
    })
    expect(await readIfExists(path.join(dir, '.source.json'))).toBe('{"source":"vscode"}')
  })
})

describe('installExtensionAtomically — actualización', () => {
  it('sustituye el contenido anterior por el nuevo', async () => {
    await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('1.0.0') })
    const dir = await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('2.0.0') })

    expect(await readIfExists(path.join(dir, 'manifest.json'))).toContain('"version":"2.0.0"')
    expect(await readIfExists(path.join(dir, 'dist/index.js'))).toBe('// versión 2.0.0')
  })

  it('elimina los archivos que la versión nueva ya no trae', async () => {
    await installExtensionAtomically({
      root,
      id: 'mi-ext',
      files: pkg('1.0.0', { 'obsoleto.js': 'viejo' })
    })
    const dir = await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('2.0.0') })

    // El patrón viejo (rm + escribir) también lo borraba; el nuevo también,
    // porque el swap mueve un árbol staged limpio en su sitio.
    expect(await readIfExists(path.join(dir, 'obsoleto.js'))).toBeNull()
  })

  it('no deja restos tras actualizar', async () => {
    await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('1.0.0') })
    await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('2.0.0') })
    expect(await listing(root)).toEqual(['mi-ext'])
  })
})

describe('installExtensionAtomically — fallos que antes perdían la instalación', () => {
  it('si falla el sidecar, la versión anterior sigue intacta', async () => {
    await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('1.0.0') })

    await expect(
      installExtensionAtomically({
        root,
        id: 'mi-ext',
        files: pkg('2.0.0'),
        sidecar: async () => {
          throw new Error('disco lleno')
        }
      })
    ).rejects.toThrow('disco lleno')

    const dir = path.join(root, 'mi-ext')
    expect(await readIfExists(path.join(dir, 'manifest.json'))).toContain('"version":"1.0.0"')
    expect(await readIfExists(path.join(dir, 'dist/index.js'))).toBe('// versión 1.0.0')
  })

  it('si falla la escritura de un archivo, la versión anterior sigue intacta', async () => {
    await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('1.0.0') })

    // Un paquete con una entrada que hace de DIRECTORIO de otra: se escribe el
    // archivo primero y el mkdir del segundo revienta con ENOTDIR/ENFILE.
    // Es el fallo típico a mitad de una extracción.
    const files = new Map<string, string>([
      ['manifest.json', JSON.stringify({ id: 'mi-ext', version: '2.0.0' })],
      ['conflicto', 'soy un archivo'],
      ['conflicto/hijo.js', 'necesito que conflicto sea un directorio']
    ])

    await expect(
      installExtensionAtomically({ root, id: 'mi-ext', files })
    ).rejects.toThrow()

    const dir = path.join(root, 'mi-ext')
    expect(await readIfExists(path.join(dir, 'manifest.json'))).toContain('"version":"1.0.0"')
    expect(await readIfExists(path.join(dir, 'dist/index.js'))).toBe('// versión 1.0.0')
  })

  it('una extensión que ya existe como carpeta vacía se sustituye bien', async () => {
    await fs.mkdir(path.join(root, 'mi-ext'), { recursive: true })
    const dir = await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('1.0.0') })

    expect(await readIfExists(path.join(dir, 'manifest.json'))).toContain('"version":"1.0.0"')
    expect(await listing(root)).toEqual(['mi-ext'])
  })

  it('un paquete vacío no borra la instalación existente', async () => {
    await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('1.0.0') })

    // Sin este guard el swap dejaba el destino vacío y la extensión previa
    // destruida: un paquete sin contenido no debe poder "instalarse".
    await expect(
      installExtensionAtomically({ root, id: 'mi-ext', files: new Map<string, string>() })
    ).rejects.toThrow(/no contiene archivos/)

    const dir = path.join(root, 'mi-ext')
    expect(await readIfExists(path.join(dir, 'manifest.json'))).toContain('"version":"1.0.0"')
  })

  it('un paquete sin manifest no borra la instalación existente', async () => {
    await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('1.0.0') })

    // Todas las entradas escapan del directorio → nada instalable.
    const escapado = new Map<string, string>([['../fuera.txt', 'x']])
    await expect(
      installExtensionAtomically({ root, id: 'mi-ext', files: escapado })
    ).rejects.toThrow(/no contiene archivos/)

    const dir = path.join(root, 'mi-ext')
    expect(await readIfExists(path.join(dir, 'manifest.json'))).toContain('"version":"1.0.0"')
  })

  it('no deja directorios de staging tras un fallo', async () => {
    await expect(
      installExtensionAtomically({
        root,
        id: 'mi-ext',
        files: pkg('1.0.0'),
        sidecar: async () => {
          throw new Error('boom')
        }
      })
    ).rejects.toThrow()

    const entries = await listing(root)
    expect(entries.filter((e) => e.startsWith('.staging-'))).toEqual([])
    expect(entries.filter((e) => e.startsWith('.backup-'))).toEqual([])
  })
})

describe('installExtensionAtomically — rutas del paquete', () => {
  it('omite las entradas que escapan del directorio', async () => {
    const files = new Map<string, string>([
      ['manifest.json', JSON.stringify({ id: 'mi-ext', version: '1.0.0' })],
      ['../../escapada.txt', 'no debe existir'],
      ['dist/legal.js', 'ok']
    ])

    const dir = await installExtensionAtomically({ root, id: 'mi-ext', files })

    expect(await readIfExists(path.join(dir, 'dist/legal.js'))).toBe('ok')
    expect(await readIfExists(path.join(root, '..', 'escapada.txt'))).toBeNull()
    // Y el staging tampoco la escribe fuera de sí mismo.
    expect(await listing(root)).toEqual(['mi-ext'])
  })

  it('no aborta la instalación por una entrada inválida', async () => {
    const files = new Map<string, string>([
      ['manifest.json', '{"id":"mi-ext"}'],
      ['../fuera.txt', 'x']
    ])
    const dir = await installExtensionAtomically({ root, id: 'mi-ext', files })
    expect(await readIfExists(path.join(dir, 'manifest.json'))).toBe('{"id":"mi-ext"}')
  })
})

describe('resolveInsideDir', () => {
  it('resuelve una ruta relativa dentro', () => {
    expect(resolveInsideDir(path.join('/base'), 'a/b.txt')).toBe(
      path.resolve('/base', 'a/b.txt')
    )
  })

  it('devuelve null ante un escape por ..', () => {
    expect(resolveInsideDir(path.join('/base'), '../fuera.txt')).toBeNull()
    expect(resolveInsideDir(path.join('/base'), 'a/../../fuera.txt')).toBeNull()
  })

  it('devuelve null ante una ruta absoluta', () => {
    expect(resolveInsideDir(path.join('/base'), '/etc/passwd')).toBeNull()
  })

  it('acepta la raíz misma', () => {
    expect(resolveInsideDir(path.join('/base'), '.')).toBe(path.resolve('/base'))
  })
})

describe('cleanupStaleInstalls', () => {
  it('borra staging y backup huérfanos sin tocar las extensiones', async () => {
    await installExtensionAtomically({ root, id: 'mi-ext', files: pkg('1.0.0') })
    await fs.mkdir(path.join(root, '.staging-mi-ext-basura', 'dist'), { recursive: true })
    await fs.mkdir(path.join(root, '.backup-mi-ext-basura'), { recursive: true })

    await cleanupStaleInstalls(root)

    expect(await listing(root)).toEqual(['mi-ext'])
  })

  it('no falla si el directorio no existe', async () => {
    await expect(cleanupStaleInstalls(path.join(root, 'no-existe'))).resolves.toBeUndefined()
  })
})