/**
 * Tests: completionItem/resolve dirigido, $/progress y semantic tokens —
 * las capacidades nuevas del protocolo.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { LspClient } from '../../src/main/lsp/client'
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
  homeDir = await makeTempDir('lsp-adv-home-')
  projectDir = await makeTempDir('lsp-adv-proj-')
  useScrakkHomeForTests(homeDir)
})

afterEach(async () => {
  resetScrakkHome()
  await cleanupDir(homeDir)
  await cleanupDir(projectDir)
})

describe('completionItem/resolve dirigido', () => {
  it('el resolve llega SOLO al server que devolvió el ítem', async () => {
    await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
      alpha: {
        command: process.execPath,
        args: [MOCK_SERVER, 'alpha'],
        extensions: { '.mockts': 'mocklang' }
      }
    })

    const manager = new LspManager(() => {}, () => {})
    await manager.setWorkspace(projectDir!)

    const file = path.join(projectDir!, 'c.mockts')
    await fs.writeFile(file, '')
    await manager.ensureFileOpen(file)

    const completion = await manager.request({
      method: 'textDocument/completion',
      params: { textDocument: { uri: `file://${file}` }, position: { line: 0, character: 0 } },
      filePath: file
    })
    const alphaResult = completion.results.find((r) => r.serverName === 'alpha')
    expect(alphaResult?.result).toEqual([{ label: 'alpha-item', kind: 2 }])

    // Resolve DIRIGIDO por serverName.
    const resolved = await manager.request({
      method: 'completionItem/resolve',
      params: (alphaResult!.result as unknown[])[0],
      filePath: file,
      serverName: 'alpha'
    })
    expect(resolved.results).toHaveLength(1)
    expect((resolved.results[0].result as { documentation?: string }).documentation).toBe(
      'resolved by alpha'
    )

    // Server inexistente → error controlado.
    const bad = await manager.request({
      method: 'completionItem/resolve',
      params: {},
      serverName: 'fantasma'
    })
    expect(bad.ok).toBe(false)

    await manager.shutdownAll()
  }, 20_000)
})

describe('progreso $/progress', () => {
  it('begin/report/end llegan con el token del request', async () => {
    const projectDir = await makeTempDir('lsp-progress-')
    try {
      const progress: Array<{ phase: string; token: string; percentage?: number }> = []
      const client = new LspClient('prog', 1, {
        command: process.execPath,
        args: [MOCK_SERVER, 'prog'],
        extensions: { '.x': 'x' }
      }, projectDir, {
        onDiagnostics: () => {},
        onState: () => {},
        onProcessExit: () => {},
        onProgress: (payload) =>
          progress.push({ phase: payload.phase, token: payload.token, percentage: payload.percentage })
      })

      await client.start()

      const result = await client.request<{ uri: string }>(
        'textDocument/definition',
        { textDocument: { uri: 'file:///tmp/x.ts' }, position: { line: 0, character: 0 } },
        10_000
      )
      expect(result.uri).toContain('mock-target.ts')

      await waitFor(() => progress.length >= 3, 5000)
      const phases = progress.map((p) => p.phase)
      expect(phases[0]).toBe('begin')
      expect(phases).toContain('report')
      expect(phases[phases.length - 1]).toBe('end')
      // Mismo token para todo el ciclo.
      expect(new Set(progress.map((p) => p.token)).size).toBe(1)
      expect(progress.find((p) => p.phase === 'report')?.percentage).toBe(50)

      await client.shutdown()
    } finally {
      await cleanupDir(projectDir)
    }
  }, 20_000)
})

describe('semantic tokens + inlay hints (passthrough)', () => {
  it('semanticTokens/full devuelve data cuando el server la declara', async () => {
    process.env.MOCK_SEMANTIC = '1'
    try {
      const projectDir2 = await makeTempDir('lsp-sem-')
      try {
        const client = new LspClient('sem', 1, {
          command: process.execPath,
          args: [MOCK_SERVER, 'sem'],
          extensions: { '.ts': 'typescript' }
        }, projectDir2, {
          onDiagnostics: () => {},
          onState: () => {},
          onProcessExit: () => {}
        })

        await client.start()
        const result = await client.request<{ data: number[] }>(
          'textDocument/semanticTokens/full',
          { textDocument: { uri: 'file:///tmp/f.ts' } },
          10_000
        )
        expect(Array.isArray(result.data)).toBe(true)
        expect(result.data?.length).toBeGreaterThan(0)

        await client.shutdown()
      } finally {
        await cleanupDir(projectDir2)
      }
    } finally {
      delete process.env.MOCK_SEMANTIC
    }
  }, 20_000)
})
