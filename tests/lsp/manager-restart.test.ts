/**
 * Test de crash → restart (réplica de restart.rs):
 * kill real del proceso hijo → crashed → retrying (backoff 1s) → ready con
 * NUEVO pid → replay de documentos y diagnósticos funcionando.
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
  homeDir = await makeTempDir('lsp-crash-home-')
  projectDir = await makeTempDir('lsp-crash-proj-')
  useScrakkHomeForTests(homeDir)
})

afterEach(async () => {
  resetScrakkHome()
  await cleanupDir(homeDir)
  await cleanupDir(projectDir)
})

describe('restart-on-crash', () => {
  it('kill del hijo → retrying → nuevo pid → replay del documento', async () => {
    await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
      alpha: {
        command: process.execPath,
        args: [MOCK_SERVER, 'alpha'],
        extensions: { '.mockts': 'mocklang' },
        restartOnCrash: true,
        maxRestarts: 3
      }
    })

    const events: Array<{ serverName: string; state: string }> = []
    const manager = new LspManager(
      (payload) => events.push({ serverName: payload.serverName, state: payload.state }),
      () => {}
    )
    await manager.setWorkspace(projectDir!)

    // Arranque lazy + documento abierto.
    const file = path.join(projectDir!, 'app.mockts')
    const content = 'const app = 1\n'
    await fs.writeFile(file, content)
    await manager.notifyFileChanged(file, content)
    await waitFor(() => manager.status().find((s) => s.name === 'alpha')?.state === 'ready')

    const pidBefore = manager.getRunningPid('alpha')
    expect(pidBefore).toBeGreaterThan(0)

    // KILL REAL del proceso hijo.
    process.kill(pidBefore!, 'SIGKILL')

    // El manager debe detectar el crash y reiniciar (backoff 1s).
    await waitFor(() => {
      const state = manager.status().find((s) => s.name === 'alpha')?.state
      return state === 'ready' && manager.getRunningPid('alpha') !== pidBefore
    }, 15_000)

    const states = events.filter((e) => e.serverName === 'alpha').map((e) => e.state)
    expect(states).toContain('crashed')
    expect(states).toContain('retrying')

    // Replay: el documento reabierto sigue sincronizado — una edición nueva
    // sobre el cliente reiniciado produce diagnósticos frescos.
    const files = await manager.drainDiagnostics(3000)
    void files

    const content2 = content + 'const b = 2\n'
    await fs.writeFile(file, content2)
    await manager.notifyFileChanged(file, content2)

    const drained = await manager.drainDiagnostics(5000)
    expect(drained.length).toBeGreaterThan(0)
    expect(drained[0].diagnostics[0].source).toBe('alpha')

    // Presupuesto: quedan 2 de 3 tras un restart.
    await manager.shutdownAll()
  }, 30_000)

  it('sin restartOnCrash el server queda caído', async () => {
    await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
      beta: {
        command: process.execPath,
        args: [MOCK_SERVER, 'beta'],
        extensions: { '.mockts': 'mocklang' }
      }
    })

    const manager = new LspManager(() => {}, () => {})
    await manager.setWorkspace(projectDir!)

    const file = path.join(projectDir!, 'x.mockts')
    await fs.writeFile(file, 'x\n')
    await manager.notifyFileChanged(file, 'x\n')
    await waitFor(() => manager.status().find((s) => s.name === 'beta')?.state === 'ready')

    const pid = manager.getRunningPid('beta')!
    process.kill(pid, 'SIGKILL')

    // Sin monitor: no hay retrying ni recuperación automática.
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const status = manager.status().find((s) => s.name === 'beta')
    expect(['crashed', 'stopped']).toContain(status?.state)

    await manager.shutdownAll()
  }, 20_000)
})
