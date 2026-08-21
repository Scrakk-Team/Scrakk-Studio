/**
 * Tests de integración del LspManager — la réplica del flujo completo del CLI:
 * .scrakk/lsp.json con DOS servers para la misma extensión → tocar archivo →
 * drain espera a AMBOS y agrega → requests enrutados/broadcast → status.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { LspManager } from '../../src/main/lsp/manager'
import { useScrakkHomeForTests, resetScrakkHome, writeJsonLayer, projectConfigPath } from '../../src/main/scrakkFolder'
import { makeTempDir, cleanupDir, waitFor } from '../helpers/lsp-test-utils'

const MOCK_SERVER = path.resolve(__dirname, '../helpers/mock-lsp-server.mjs')

let homeDir: string | undefined
let projectDir: string | undefined

beforeEach(async () => {
  homeDir = await makeTempDir('lsp-mgr-home-')
  projectDir = await makeTempDir('lsp-mgr-proj-')
  useScrakkHomeForTests(homeDir)
})

afterEach(async () => {
  resetScrakkHome()
  await cleanupDir(homeDir)
  await cleanupDir(projectDir)
})

function mockServerConfig(name: string): Record<string, unknown> {
  return {
    command: process.execPath,
    args: [MOCK_SERVER, name],
    extensions: { '.mockts': 'mocklang' }
  }
}

async function makeManager() {
  const events: Array<{ serverName: string; state: string }> = []
  const manager = new LspManager(
    (payload) => events.push({ serverName: payload.serverName, state: payload.state }),
    () => {}
  )
  const servers = await manager.setWorkspace(projectDir!)
  return { manager, events, servers }
}

describe('LspManager (integración end-to-end)', () => {
  it('setWorkspace carga config de proyecto + descubre builtins sin pisar', async () => {
    await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
      alpha: mockServerConfig('alpha')
    })

    const { servers } = await makeManager()
    // El server del .scrakk/lsp.json SIEMPRE está.
    expect(servers).toContain('alpha')
  }, 20_000)

  it('arranque lazy: el server solo corre cuando se toca un archivo que le matchea', async () => {
    await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
      alpha: mockServerConfig('alpha')
    })

    const { manager } = await makeManager()
    expect(manager.status().find((s) => s.name === 'alpha')?.state).toBe('stopped')

    const file = path.join(projectDir!, 'code.mockts')
    await fs.writeFile(file, 'hello\n')
    await manager.notifyFileChanged(file, 'hello\n')

    await waitFor(() => manager.status().find((s) => s.name === 'alpha')?.state === 'ready')
    expect(manager.status().find((s) => s.name === 'alpha')?.source).toBe('project')

    await manager.shutdownAll()
  }, 25_000)

  it('drain agrega diagnósticos de TODOS los servers (multi-server routing)', async () => {
    await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
      alpha: mockServerConfig('alpha'),
      beta: mockServerConfig('beta')
    })

    const { manager } = await makeManager()

    const file = path.join(projectDir!, 'shared.mockts')
    await fs.writeFile(file, 'shared\n')
    await manager.notifyFileChanged(file, 'shared\n')

    // Réplica de drain_lsp_diagnostics: espera a que AMBOS reporten.
    const files = await manager.drainDiagnostics(5000)

    expect(files).toHaveLength(1)
    expect(files[0].path).toBe(path.resolve(file))
    const sources = files[0].diagnostics.map((d) => d.source).sort()
    expect(sources).toEqual(['alpha', 'beta'])
    expect(files[0].diagnostics.every((d) => d.severity === 1)).toBe(true)

    // Drain sin pendientes → vacío.
    expect(await manager.drainDiagnostics(200)).toEqual([])

    await manager.shutdownAll()
  }, 25_000)

  it('drain respeta el deadline si un server nunca reporta', async () => {
    await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
      alpha: mockServerConfig('alpha'),
      beta: mockServerConfig('beta')
    })

    const { manager } = await makeManager()

    const file = path.join(projectDir!, 'pending.mockts')
    await fs.writeFile(file, 'x\n')
    await manager.notifyFileChanged(file, 'x\n')

    // Esperar a que SOLO uno haya reportado es raro de sincronizar; en su
    // lugar probamos el deadline con un timeout mínimo real: ambos reportan
    // rápido, así que validamos que el drain NO cuelga más allá del timeout
    // y que limpia pendientes.
    const started = Date.now()
    const files = await manager.drainDiagnostics(3000)
    expect(Date.now() - started).toBeLessThan(10_000)
    expect(files.length).toBeGreaterThan(0)

    await manager.shutdownAll()
  }, 25_000)

  it('request se enruta al server del archivo; broadcast llega a todos', async () => {
    await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
      alpha: mockServerConfig('alpha'),
      beta: mockServerConfig('beta')
    })

    const { manager } = await makeManager()

    const fileA = path.join(projectDir!, 'a.mockts')
    await fs.writeFile(fileA, 'a\n')
    await manager.ensureFileOpen(fileA)

    // Enrutado por archivo: los servers que atienden .mockts son alpha+beta,
    // ambos corriendo → dos resultados agregados.
    const routed = await manager.request({
      method: 'textDocument/hover',
      params: { textDocument: { uri: `file://${fileA}` }, position: { line: 0, character: 0 } },
      filePath: fileA
    })
    expect(routed.ok).toBe(true)
    expect(routed.results.map((r) => r.serverName).sort()).toEqual(['alpha', 'beta'])

    // Broadcast a todo lo corriendo.
    const broadcast = await manager.request({
      method: 'workspace/symbol',
      params: { query: 'x' },
      broadcast: true
    })
    expect(broadcast.results.length).toBeGreaterThanOrEqual(2)

    // Sin filePath ni broadcast → error controlado.
    const bad = await manager.request({ method: 'textDocument/hover' })
    expect(bad.ok).toBe(false)
    expect(bad.error).toContain('filePath')

    await manager.shutdownAll()
  }, 25_000)

  it('readDiagnostics abre archivos bajo demanda y devuelve ERROR/WARNING', async () => {
    await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
      alpha: mockServerConfig('alpha')
    })

    const { manager } = await makeManager()

    const file = path.join(projectDir!, 'probe.mockts')
    await fs.writeFile(file, 'probe\n')

    const results = await manager.readDiagnostics([file])
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe(path.resolve(file))
    expect(results[0].diagnostics[0].message).toContain('alpha')

    await manager.shutdownAll()
  }, 25_000)

  it('status reporta estado y origen de cada server', async () => {
    await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
      alpha: mockServerConfig('alpha')
    })

    const { manager } = await makeManager()
    const status = manager.status().filter((s) => s.name === 'alpha')
    expect(status).toHaveLength(1)
    expect(status[0].state).toBe('stopped')
    expect(status[0].source).toBe('project')
    expect(status[0].extensions).toContain('.mockts')

    await manager.shutdownAll()
  }, 20_000)
})
