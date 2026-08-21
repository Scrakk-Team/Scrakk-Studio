/**
 * Tests de config LSP — parse con aliases y fusión en capas .scrakk.
 * Mismo formato que detecta scrakk-cli (~/.scrakk/lsp.json + <root>/.scrakk/lsp.json).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  parseLspServerConfig,
  loadConfiguredServers
} from '../../src/main/lsp/config'
import { startupTimeoutMs, shutdownTimeoutMs, maxRestarts } from '@shared/lsp'
import {
  useScrakkHomeForTests,
  resetScrakkHome,
  writeJsonLayer,
  userConfigPath,
  projectConfigPath
} from '../../src/main/scrakkFolder'
import { makeTempDir, cleanupDir } from '../helpers/lsp-test-utils'

let homeDir: string | undefined
let projectDir: string | undefined

beforeEach(async () => {
  homeDir = await makeTempDir('lsp-config-home-')
  projectDir = await makeTempDir('lsp-config-proj-')
  useScrakkHomeForTests(homeDir)
})

afterEach(async () => {
  resetScrakkHome()
  await cleanupDir(homeDir)
  await cleanupDir(projectDir)
})

describe('parseLspServerConfig', () => {
  it('parsea una entrada completa', () => {
    const config = parseLspServerConfig(
      {
        command: 'typescript-language-server',
        args: ['--stdio'],
        extensions: { '.ts': 'typescript' },
        settings: { format: true },
        restartOnCrash: true,
        maxRestarts: 5
      },
      'typescript'
    )

    expect(config).not.toBeNull()
    expect(config!.command).toBe('typescript-language-server')
    expect(config!.args).toEqual(['--stdio'])
    expect(config!.extensions).toEqual({ '.ts': 'typescript' })
    expect(config!.restartOnCrash).toBe(true)
    expect(config!.maxRestarts).toBe(5)
  })

  it('acepta el alias extensionToLanguage (compat CLI)', () => {
    const config = parseLspServerConfig(
      { command: 'x', extensionToLanguage: { ts: 'typescript' } },
      'x'
    )
    // Normaliza la extensión sin punto a ".ts".
    expect(config!.extensions).toEqual({ '.ts': 'typescript' })
  })

  it('normaliza extensiones sin punto', () => {
    const config = parseLspServerConfig(
      { command: 'x', extensions: { py: 'python', '.go': 'go' } },
      'x'
    )
    expect(config!.extensions).toEqual({ '.py': 'python', '.go': 'go' })
  })

  it('rechaza entradas sin command o no-objeto', () => {
    expect(parseLspServerConfig({ args: [] }, 'x')).toBeNull()
    expect(parseLspServerConfig('nope', 'x')).toBeNull()
    expect(parseLspServerConfig(null, 'x')).toBeNull()
  })

  it('defaults de timeouts vía helpers del contrato compartido', () => {
    const bare = parseLspServerConfig({ command: 'x' }, 'x')!
    expect(startupTimeoutMs(bare)).toBe(15_000)
    expect(shutdownTimeoutMs(bare)).toBe(5_000)
    expect(maxRestarts(bare)).toBe(3)
  })
})

describe('loadConfiguredServers (capas .scrakk)', () => {
  it('carga solo usuario si no hay proyecto', async () => {
    await writeJsonLayer(
      userConfigPath('lsp.json'),
      { userServer: { command: 'user-cmd', extensions: { '.u': 'u' } } }
    )

    const { configs, sources } = await loadConfiguredServers(projectDir!)
    expect(configs.userServer.command).toBe('user-cmd')
    expect(sources.userServer).toBe('user')
  })

  it('el proyecto pisa al usuario por nombre de server', async () => {
    await writeJsonLayer(userConfigPath('lsp.json'), {
      shared: { command: 'from-user', extensions: { '.s': 's' } }
    })
    await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
      shared: { command: 'from-project', extensions: { '.s': 's' } }
    })

    const { configs, sources } = await loadConfiguredServers(projectDir!)
    expect(configs.shared.command).toBe('from-project')
    expect(sources.shared).toBe('project')
  })

  it('descarta servers inválidos sin romper los válidos', async () => {
    await writeJsonLayer(userConfigPath('lsp.json'), {
      good: { command: 'ok', extensions: { '.g': 'g' } },
      bad: { args: ['sin-command'] }
    })

    const { configs } = await loadConfiguredServers(projectDir!)
    expect(Object.keys(configs)).toEqual(['good'])
  })
})
