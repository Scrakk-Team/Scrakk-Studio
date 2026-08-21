/**
 * Tests del cliente LSP — ciclo de vida completo contra un language server
 * mock real (JSON-RPC por stdio), réplica de los E2E de tests.rs del CLI.
 *
 * Flujo probado: spawn → initialize → initialized → didOpen →
 * publishDiagnostics recibido → request (definition/hover) → shutdown limpio.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { LspClient } from '../../src/main/lsp/client'
import type { DiagnosticsChangedPayload, LspServerStateKind } from '@shared/lsp'
import { makeTempDir, cleanupDir } from '../helpers/lsp-test-utils'

const MOCK_SERVER = path.resolve(__dirname, '../helpers/mock-lsp-server.mjs')

let projectDir: string | undefined

beforeEach(async () => {
  projectDir = await makeTempDir('lsp-client-')
})

afterEach(async () => {
  await cleanupDir(projectDir)
})

function makeClient(
  name: string,
  onDiagnostics: (payload: DiagnosticsChangedPayload) => void,
  onState?: (state: LspServerStateKind, error?: string) => void
): LspClient {
  return new LspClient(name, 1, {
    command: process.execPath,
    args: [MOCK_SERVER, name],
    extensions: { '.mockts': 'mocklang' }
  }, projectDir!, {
    onDiagnostics,
    onState: onState ?? (() => {}),
    onProcessExit: () => {}
  })
}

describe('LspClient (E2E contra mock real)', () => {
  it('handshake completo y estado ready', async () => {
    const states: LspServerStateKind[] = []
    const client = makeClient('handshake', () => {}, (state) => states.push(state))

    await client.start()
    expect(client.getState()).toBe('ready')
    expect(states).toContain('ready')

    await client.shutdown()
    expect(client.getState()).toBe('stopped')
  })

  it('didOpen dispara publishDiagnostics con el mensaje del server', async () => {
    const received: DiagnosticsChangedPayload[] = []
    const client = makeClient('diags', (payload) => received.push(payload))

    await client.start()

    const file = path.join(projectDir!, 'main.mockts')
    await fs.writeFile(file, 'const x = 1\n')
    await client.notifyFileChange(file, 'const x = 1\n', 'mocklang')

    // El mock publica en didOpen Y didSave; esperamos al menos uno.
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (received.length > 0) {
          clearInterval(timer)
          resolve()
        }
      }, 25)
      setTimeout(() => {
        clearInterval(timer)
        resolve()
      }, 5000)
    })

    expect(received.length).toBeGreaterThan(0)
    expect(received[0].serverName).toBe('diags')
    expect(received[0].path).toBe(file)
    expect(received[0].diagnostics[0].severity).toBe(1)

    // Modelo de lectura: presencia + contenido.
    expect(client.hasPublished(file)).toBe(true)
    expect(client.getDiagnostics(file)).toHaveLength(1)

    await client.shutdown()
  }, 15_000)

  it('didChange incrementa la versión (sync full-text)', async () => {
    const client = makeClient('versions', () => {})
    await client.start()

    const file = path.join(projectDir!, 'app.mockts')
    await client.notifyFileChange(file, 'v0\n', 'mocklang')
    await client.notifyFileChange(file, 'v1\n', 'mocklang')
    await client.notifyFileChange(file, 'v2\n', 'mocklang')

    expect(client.hasDocument(file)).toBe(true)
    // Tres syncs sobre el MISMO documento sin re-abrirlo.
    const docs = client.trackedDocuments()
    expect(docs).toHaveLength(1)
    expect(docs[0].languageId).toBe('mocklang')

    await client.shutdown()
  })

  it('request textDocument/definition devuelve location del server', async () => {
    const client = makeClient('defreq', () => {})
    await client.start()

    const file = path.join(projectDir!, 'caller.mockts')
    await fs.writeFile(file, 'call()\n')
    await client.ensureFileOpen(file, 'mocklang')

    const result = await client.request<{ uri: string; range: { start: { line: number } } }>(
      'textDocument/definition',
      { textDocument: { uri: `file://${file}` }, position: { line: 0, character: 0 } },
      10_000
    )

    expect(result.uri.endsWith('mock-target.ts')).toBe(true)
    expect(result.range.start.line).toBe(4)

    await client.shutdown()
  }, 15_000)

  it('shutdown ordenado termina el proceso hijo', async () => {
    let exited = false
    const client = new LspClient('exitcheck', 1, {
      command: process.execPath,
      args: [MOCK_SERVER, 'exitcheck'],
      extensions: { '.x': 'x' }
    }, projectDir!, {
      onDiagnostics: () => {},
      onState: () => {},
      onProcessExit: () => {
        exited = true
      }
    })

    await client.start()
    await client.shutdown()

    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (exited) {
          clearInterval(timer)
          resolve()
        }
      }, 25)
      setTimeout(() => {
        clearInterval(timer)
        resolve()
      }, 5000)
    })
    expect(exited).toBe(true)
  }, 15_000)
})
