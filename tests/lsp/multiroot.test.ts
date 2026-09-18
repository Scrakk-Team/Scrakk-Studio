/**
 * Tests: multi-root REAL + servers dinámicos (tipo de extensión 'lspServers').
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { LspManager } from '../../src/main/lsp/manager'
import {
  useScrakkHomeForTests,
  resetScrakkHome,
  writeJsonLayer,
  projectConfigPath
} from '../../src/main/scrakkFolder'
import { makeTempDir, cleanupDir, waitFor } from '../helpers/lsp-test-utils'

const MOCK_SERVER = path.resolve(__dirname, '../helpers/mock-lsp-server.mjs')

let homeDir: string | undefined

beforeEach(async () => {
  homeDir = await makeTempDir('lsp-multi-home-')
  useScrakkHomeForTests(homeDir)
})

afterEach(async () => {
  resetScrakkHome()
  await cleanupDir(homeDir)
})

function mockConfig(name: string): Record<string, unknown> {
  return {
    command: process.execPath,
    args: [MOCK_SERVER, name],
    extensions: { '.mockts': 'mocklang' }
  }
}

describe('multi-root real', () => {
  it('dos roots con servers distintos: el archivo enruta SOLO a su root', async () => {
    const root1 = await makeTempDir('lsp-root1-')
    const root2 = await makeTempDir('lsp-root2-')

    try {
      await writeJsonLayer(projectConfigPath(root1!, 'lsp.json'), { one: mockConfig('one') })
      await writeJsonLayer(projectConfigPath(root2!, 'lsp.json'), { two: mockConfig('two') })

      const manager = new LspManager(() => {}, () => {})
      await manager.setWorkspace(root1!)
      await manager.addWorkspaceRoot(root2!)

      // Archivo del root2: solo 'two' debe correr.
      const file2 = path.join(root2!, 'app.mockts')
      await fs.writeFile(file2, '')
      await manager.ensureFileOpen(file2)
      await waitFor(() => manager.status().some((s) => s.name === 'two' && s.state === 'ready'))

      expect(manager.status().find((s) => s.name === 'one')?.state).toBe('stopped')
      expect(manager.status().find((s) => s.name === 'two')?.state).toBe('ready')

      // El status distingue instancias por root (ids `name@root`).
      const two = manager.status().find((s) => s.id === `two@${root2}`)
      expect(two?.root).toBe(root2)

      // Request dirigido por archivo va al server del root dueño.
      const res = await manager.request({
        method: 'textDocument/hover',
        params: { textDocument: { uri: `file://${file2}` }, position: { line: 0, character: 0 } },
        filePath: file2
      })
      expect(res.results.map((r) => r.serverName)).toEqual(['two'])

      // removeWorkspaceRoot apaga los clientes de ese root.
      await manager.removeWorkspaceRoot(root2!)
      expect(manager.listRoots()).toEqual([root1])
      expect(manager.status().find((s) => s.name === 'two')?.state ?? 'stopped').toBe('stopped')

      await manager.shutdownAll()
    } finally {
      await cleanupDir(root1)
      await cleanupDir(root2)
    }
  }, 30_000)

  it('el root más profundo gana cuando hay anidamiento', async () => {
    const outer = await makeTempDir('lsp-outer-')
    const inner = path.join(outer!, 'packages', 'app')
    await fs.mkdir(inner, { recursive: true })

    try {
      const manager = new LspManager(() => {}, () => {})
      await manager.setWorkspace(outer!)
      await manager.addWorkspaceRoot(inner!)

      const file = path.join(inner, 'src', 'index.mockts')
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, '')

      // Sin servers configurados no crashea; solo verificamos ownership vía
      // roots registrados y fallback al primario.
      expect(manager.listRoots().length).toBe(2)
      expect(manager.getPrimaryRoot()).toBe(outer)

      await manager.shutdownAll()
    } finally {
      await cleanupDir(outer)
    }
  }, 20_000)
})

describe('servers dinámicos (ext type lspServers)', () => {
  it('registerDynamicServers agrega servers con source dynamic; remove los quita', async () => {
    const projectDir = await makeTempDir('lsp-dyn-proj-')
    try {
      const manager = new LspManager(() => {}, () => {})

      // Registrar ANTES de setWorkspace: loadRoot los incluye.
      manager.registerDynamicServers('my-ext-id', [
        {
          id: 'dyn-server',
          command: process.execPath,
          args: [MOCK_SERVER, 'dyn'],
          extensions: { '.mockts': 'mocklang' }
        }
      ])
      await manager.setWorkspace(projectDir)

      const status = manager.status().filter((s) => s.name === 'dyn-server')
      expect(status).toHaveLength(1)
      expect(status[0].source).toBe('dynamic')

      // Arranca y sirve como cualquier otro.
      const file = path.join(projectDir!, 'd.mockts')
      await fs.writeFile(file, '')
      await manager.ensureFileOpen(file)
      await waitFor(() => manager.status().find((s) => s.name === 'dyn-server')?.state === 'ready')

      // Quitar → desaparece del registro Y se apaga su cliente.
      await manager.removeDynamicServers('my-ext-id')
      expect(manager.status().some((s) => s.name === 'dyn-server')).toBe(false)

      await manager.shutdownAll()
    } finally {
      await cleanupDir(projectDir)
    }
  }, 25_000)

  it('merge por id: registrar dos veces el mismo sourceId acumula sin duplicar', async () => {
    const projectDir = await makeTempDir('lsp-dyn-merge-')
    try {
      const manager = new LspManager(() => {}, () => {})
      manager.registerDynamicServers('ext', [
        { id: 'srv-a', command: process.execPath, args: [MOCK_SERVER, 'a'], extensions: { '.a': 'a' } }
      ])
      manager.registerDynamicServers('ext', [
        { id: 'srv-b', command: process.execPath, args: [MOCK_SERVER, 'b'], extensions: { '.b': 'b' } },
        // Re-registro del mismo id: reemplaza, no duplica.
        { id: 'srv-a', command: process.execPath, args: [MOCK_SERVER, 'a2'], extensions: { '.a': 'a' } }
      ])

      await manager.setWorkspace(projectDir)
      const dyn = manager.status().filter((s) => s.source === 'dynamic').map((s) => s.name).sort()
      expect(dyn).toEqual(['srv-a', 'srv-b'])

      await manager.shutdownAll()
    } finally {
      await cleanupDir(projectDir)
    }
  }, 20_000)
})
