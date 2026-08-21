/**
 * Tests de routing LSP — extensión + root markers (réplica de resolve_servers
 * y nearest_root del CLI).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { nearestRoot, resolveServers } from '../../src/main/lsp/routing'
import type { LspServerConfig } from '@shared/lsp'
import { makeTempDir, cleanupDir } from '../helpers/lsp-test-utils'

let projectDir: string | undefined

beforeEach(async () => {
  projectDir = await makeTempDir('lsp-routing-')
})

afterEach(async () => {
  await cleanupDir(projectDir)
})

function serverWith(ext: string, langId: string): LspServerConfig {
  return { command: 'cmd', extensions: { [ext]: langId } }
}

describe('nearestRoot', () => {
  it('encuentra el marker caminando hacia arriba', async () => {
    const sub = path.join(projectDir!, 'src', 'deep')
    await fs.mkdir(sub, { recursive: true })
    await fs.writeFile(path.join(projectDir!, 'Cargo.toml'), '')

    const root = await nearestRoot(path.join(sub, 'main.rs'), projectDir!, ['Cargo.toml'])
    expect(root).toBe(projectDir)
  })

  it('devuelve null si el marker está fuera del workspace', async () => {
    const outside = await makeTempDir('lsp-outside-')
    try {
      await fs.writeFile(path.join(outside, 'Cargo.toml'), '')
      const file = path.join(projectDir!, 'main.rs')
      await fs.writeFile(file, '')
      const root = await nearestRoot(file, projectDir!, ['Cargo.toml'])
      expect(root).toBeNull()
    } finally {
      await cleanupDir(outside)
    }
  })

  it('devuelve null si no hay ningún marker', async () => {
    const file = path.join(projectDir!, 'main.rs')
    await fs.writeFile(file, '')
    const root = await nearestRoot(file, projectDir!, ['Cargo.toml'])
    expect(root).toBeNull()
  })
})

describe('resolveServers (multi-server)', () => {
  it('matchea por extensión a TODOS los servers que la declaran', async () => {
    const file = path.join(projectDir!, 'app.mockts')
    await fs.writeFile(file, '')

    const matches = await resolveServers(
      {
        alpha: serverWith('.mockts', 'mocklang'),
        beta: serverWith('.mockts', 'mocklang'),
        gamma: serverWith('.other', 'other')
      },
      projectDir!,
      file,
      () => undefined
    )

    // Orden alfabético determinista (como el BTreeMap del CLI).
    expect(matches.map((m) => m.serverName)).toEqual(['alpha', 'beta'])
    expect(matches.every((m) => m.languageId === 'mocklang')).toBe(true)
  })

  it('filtra servers con root markers cuando no hay marker en el árbol', async () => {
    const file = path.join(projectDir!, 'lib.rs')
    await fs.writeFile(file, '')

    const matches = await resolveServers(
      {
        rustConMarker: serverWith('.rs', 'rust'),
        libre: serverWith('.rs', 'rust')
      },
      projectDir!,
      file,
      (name) => (name === 'rustConMarker' ? ['Cargo.toml'] : undefined)
    )

    expect(matches.map((m) => m.serverName)).toEqual(['libre'])
  })

  it('incluye servers con markers cuando el marker SÍ existe', async () => {
    await fs.writeFile(path.join(projectDir!, 'package.json'), '{}')
    const file = path.join(projectDir!, 'src', 'index.ts')
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '')

    const matches = await resolveServers(
      { typescript: serverWith('.ts', 'typescript') },
      projectDir!,
      file,
      (name) => (name === 'typescript' ? ['package.json'] : undefined)
    )

    expect(matches).toHaveLength(1)
    expect(matches[0].languageId).toBe('typescript')
  })

  it('devuelve vacío para archivos sin extensión o sin server', async () => {
    const noExt = path.join(projectDir!, 'Dockerfile')
    await fs.writeFile(noExt, '')
    expect(await resolveServers({ a: serverWith('.ts', 'ts') }, projectDir!, noExt, () => undefined)).toEqual([])

    const unknown = path.join(projectDir!, 'file.zzz')
    await fs.writeFile(unknown, '')
    expect(await resolveServers({ a: serverWith('.ts', 'ts') }, projectDir!, unknown, () => undefined)).toEqual([])
  })
})
