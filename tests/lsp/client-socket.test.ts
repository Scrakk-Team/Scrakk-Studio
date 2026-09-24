// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Test E2E del transport TCP (socket) — réplica de start_socket del CLI.
 * El mock LSP corre sobre un net.Server real en 127.0.0.1:puerto-efímero.
 */

import { describe, it, expect, afterEach } from 'vitest'
import * as net from 'net'
import { LspClient } from '../../src/main/lsp/client'
import type { DiagnosticsChangedPayload } from '@shared/lsp'

let cleanupServer: (() => void) | null = null

afterEach(() => {
  cleanupServer?.()
  cleanupServer = null
})

function encode(message: object): string {
  const body = JSON.stringify(message)
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
}

/** Mock LSP mínimo sobre TCP: initialize/didOpen/definition/hover/shutdown. */
function startTcpMock(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let buffer = ''
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf-8')
        while (true) {
          const headerEnd = buffer.indexOf('\r\n\r\n')
          if (headerEnd === -1) break
          const match = /Content-Length: (\d+)/i.exec(buffer.slice(0, headerEnd))
          if (!match) break
          const length = Number(match[1])
          if (buffer.length < headerEnd + 4 + length) break
          const message = JSON.parse(buffer.slice(headerEnd + 4, headerEnd + 4 + length))
          buffer = buffer.slice(headerEnd + 4 + length)

          if (message.method === 'initialize') {
            socket.write(
              encode({
                jsonrpc: '2.0',
                id: message.id,
                result: { capabilities: { textDocumentSync: 1 } }
              })
            )
          } else if (message.method === 'textDocument/didOpen') {
            socket.write(
              encode({
                jsonrpc: '2.0',
                method: 'textDocument/publishDiagnostics',
                params: {
                  uri: message.params.textDocument.uri,
                  diagnostics: [
                    {
                      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                      severity: 1,
                      message: 'tcp mock diagnostic'
                    }
                  ]
                }
              })
            )
          } else if (message.id !== undefined && message.method === 'textDocument/definition') {
            socket.write(encode({ jsonrpc: '2.0', id: message.id, result: null }))
          } else if (message.id !== undefined && message.method === 'shutdown') {
            socket.write(encode({ jsonrpc: '2.0', id: message.id, result: null }))
          } else if (message.id !== undefined && message.method) {
            socket.write(encode({ jsonrpc: '2.0', id: message.id, result: null }))
          }
        }
      })
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo
      resolve(address.port)
      cleanupServer = () => server.close()
    })
  })
}

describe('LspClient transport socket', () => {
  it('handshake + diagnósticos + request por TCP', async () => {
    const port = await startTcpMock()

    const received: DiagnosticsChangedPayload[] = []
    const client = new LspClient('tcpmock', 1, {
      command: `127.0.0.1:${port}`,
      transport: 'socket',
      extensions: { '.ts': 'typescript' }
    }, '/tmp', {
      onDiagnostics: (payload) => received.push(payload),
      onState: () => {},
      onProcessExit: () => {}
    })

    await client.start()
    expect(client.getState()).toBe('ready')

    await client.notifyFileChange('/tmp/tcp-file.ts', 'const a = 1\n', 'typescript')
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
    expect(received[0].diagnostics[0].message).toBe('tcp mock diagnostic')
    expect(client.hasPublished('/tmp/tcp-file.ts')).toBe(true)

    await client.shutdown()
    expect(client.getState()).toBe('stopped')
  }, 15_000)
})
