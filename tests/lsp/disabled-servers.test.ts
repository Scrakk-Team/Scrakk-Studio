/**
 * Servers apagados por el usuario — que la decisión sea REAL.
 *
 * El riesgo de un toggle de Ajustes es que sólo pinte gris: si el server sigue
 * arrancando, el usuario cree que lo apagó y sigue viendo sus diagnósticos.
 * Estos tests fijan el contrato con el `LspManager`: apagado = no arranca
 * (ni con el archivo abierto), se apaga el que estaba corriendo, y se puede
 * volver a encender.
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
let projectDir: string | undefined

beforeEach(async () => {
  homeDir = await makeTempDir('lsp-disabled-home-')
  projectDir = await makeTempDir('lsp-disabled-proj-')
  useScrakkHomeForTests(homeDir)
})

afterEach(async () => {
  resetScrakkHome()
  await cleanupDir(homeDir)
  await cleanupDir(projectDir)
})

async function withServer(config: Record<string, unknown> = {}): Promise<{
  manager: LspManager
  file: string
}> {
  await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
    alpha: {
      command: process.execPath,
      args: [MOCK_SERVER, 'alpha'],
      extensions: { '.mockts': 'mocklang' },
      ...config
    }
  })
  const manager = new LspManager(() => {}, () => {})
  await manager.setWorkspace(projectDir!)
  const file = path.join(projectDir!, 'app.mockts')
  await fs.writeFile(file, 'const app = 1\n')
  return { manager, file }
}

describe('servers apagados', () => {
  it('apagado ANTES de abrir: no arranca y `status()` lo dice', async () => {
    const { manager, file } = await withServer()
    await manager.setDisabledServers(['alpha'])

    await manager.notifyFileChanged(file, 'const app = 1\n')
    // Sin arranque: no hay cliente (ni pid) y ningún evento 'starting'.
    expect(manager.getRunningPid('alpha')).toBeUndefined()

    const status = manager.status().find((entry) => entry.name === 'alpha')
    expect(status?.disabled).toBe(true)
    // Sigue LISTADO (si no, no se podría volver a encender desde Ajustes).
    expect(status).toBeTruthy()
    await manager.shutdownAll()
  })

  it('apagarlo con el server corriendo lo apaga DE VERDAD', async () => {
    const { manager, file } = await withServer()
    await manager.notifyFileChanged(file, 'const app = 1\n')
    await waitFor(() => manager.status().find((s) => s.name === 'alpha')?.state === 'ready')
    expect(manager.getRunningPid('alpha')).toBeGreaterThan(0)

    await manager.setDisabledServers(['alpha'])
    expect(manager.getRunningPid('alpha')).toBeUndefined()
    expect(manager.disabledServerIds()).toEqual(['alpha'])

    // Y un archivo nuevo tampoco lo despierta.
    const other = path.join(projectDir!, 'otro.mockts')
    await fs.writeFile(other, 'x\n')
    await manager.notifyFileChanged(other, 'x\n')
    expect(manager.getRunningPid('alpha')).toBeUndefined()

    await manager.shutdownAll()
  })

  it('volver a encenderlo lo deja arrancar de nuevo', async () => {
    const { manager, file } = await withServer()
    await manager.setDisabledServers(['alpha'])
    await manager.notifyFileChanged(file, 'const app = 1\n')
    expect(manager.getRunningPid('alpha')).toBeUndefined()

    await manager.setDisabledServers([])
    await manager.notifyFileChanged(file, 'const app = 1\n')
    await waitFor(() => manager.getRunningPid('alpha') !== undefined)
    await manager.shutdownAll()
  })
})
