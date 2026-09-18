/**
 * Mock language server (JSON-RPC/LSP por stdio) para tests.
 *
 * Réplica del enfoque de tests.rs del CLI: un proceso hijo que habla el
 * protocolo real. Comportamiento configurable por env:
 *  - MOCK_INCREMENTAL=1        → negocia textDocumentSync incremental
 *  - MOCK_SEMANTIC=1           → capability semanticTokensProvider + respuesta
 *  - MOCK_DIAG_MESSAGE/LINE    → diagnóstico publicado en didOpen/didChange/didSave
 *  - MOCK_TARGET               → destino de textDocument/definition
 *  - MOCK_PULL=1               → anuncia `diagnosticProvider` y responde
 *                                `textDocument/diagnostic` (pull, LSP 3.17).
 *                                Como los servers reales, en este modo NO
 *                                publica por push: si el cliente no pregunta,
 *                                no hay diagnósticos.
 *  - MOCK_PULL_FAIL=1          → anuncia pull y contesta MethodNotFound
 *                                (válvula de escape del cliente), publicando
 *                                por push como antes.
 *  - MOCK_PULL_REFRESH=1       → tras el primer pull manda
 *                                `workspace/diagnostic/refresh` (el server pide
 *                                re-consultar): el cliente debe volver a pedir.
 *
 * Requests extra para aserciones: 'mock/state' devuelve { changes, version }.
 */

import readline from 'node:readline'

const serverName = process.argv[2] ?? 'mock'
const diagMessage = process.env.MOCK_DIAG_MESSAGE ?? `${serverName}: error simulado`
const diagLine = Number(process.env.MOCK_DIAG_LINE ?? '0')
const targetFile = process.env.MOCK_TARGET ?? '/tmp/mock-target.ts'
const incremental = process.env.MOCK_INCREMENTAL === '1'
const semantic = process.env.MOCK_SEMANTIC === '1'
const pull = process.env.MOCK_PULL === '1'
const pullFails = process.env.MOCK_PULL_FAIL === '1'
const pullRefresh = process.env.MOCK_PULL_REFRESH === '1'

let buffer = Buffer.alloc(0)

function send(message) {
  const body = JSON.stringify(message)
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
  process.stdout.write(header + body)
}

// Estado observable vía mock/state.
let lastChanges = null
let currentVersion = -1
/** Cuántos didChange/didSave/didOpen recibió: para afirmar lo que NO llegó. */
let changeCount = 0
let saveCount = 0
let openCount = 0
/** Cuántos `textDocument/diagnostic` pidió el cliente (y con qué documento). */
let pullCount = 0
let pulledUris = []
/** Capabilities que mandó el cliente en initialize. */
let clientCapabilities = null

// Progreso: tokens emitidos alrededor de definition.
let nextTokenId = 1

function capabilities() {
  const caps = {
    textDocumentSync: incremental ? { openClose: true, change: 2 } : 1,
    definitionProvider: true,
    hoverProvider: true,
    referencesProvider: true,
    documentSymbolProvider: true,
    completionProvider: { resolveProvider: true }
  }
  if (pull || pullFails) {
    caps.diagnosticProvider = {
      documentSelector: null,
      interFileDependencies: false,
      workspaceDiagnostics: false
    }
  }
  if (semantic) {
    caps.semanticTokensProvider = {
      legend: { tokenTypes: ['keyword', 'string'], tokenModifiers: [] },
      full: true
    }
  }
  return caps
}

function diagItem() {
  return {
    range: {
      start: { line: diagLine, character: 0 },
      end: { line: diagLine, character: 10 }
    },
    severity: 1,
    message: diagMessage,
    source: serverName
  }
}

function publishDiagnostics(uri) {
  // Con pull registrado, el server NO publica por push (igual que los servers
  // reales: se registra uno u otro, no los dos). `pullFails` es la excepción
  // a propósito: ahí el cliente tiene que volver al push de siempre.
  if (pull) return
  send({
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: { uri, diagnostics: [diagItem()] }
  })
}

/** Progreso completo alrededor de una operación lenta. */
function runWithProgress(token, work) {
  send({
    jsonrpc: '2.0',
    id: `create-${token}`,
    method: 'window/workDoneProgress/create',
    params: { token }
  })
  send({
    jsonrpc: '2.0',
    method: '$/progress',
    params: { token, value: { kind: 'begin', title: 'indexing' } }
  })
  send({
    jsonrpc: '2.0',
    method: '$/progress',
    params: { token, value: { kind: 'report', message: '50%', percentage: 50 } }
  })
  work()
  send({
    jsonrpc: '2.0',
    method: '$/progress',
    params: { token, value: { kind: 'end', message: 'done' } }
  })
}

function onMessage(message) {
  const { id, method, params } = message

  if (method === 'initialize') {
    // Las capabilities del CLIENTE importan: los servers de CSS/HTML/JSON
    // eligen push (500 ms de retardo) o pull según `textDocument.diagnostic`.
    clientCapabilities = params?.capabilities ?? null
    send({ jsonrpc: '2.0', id, result: { capabilities: capabilities(), serverInfo: { name: serverName } } })
    return
  }
  if (method === 'shutdown') {
    send({ jsonrpc: '2.0', id, result: null })
    return
  }

  // Requests custom de aserción.
  if (method === 'mock/state') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        changes: lastChanges,
        version: currentVersion,
        incremental,
        changeCount,
        saveCount,
        openCount,
        pullCount,
        pulledUris,
        clientCapabilities
      }
    })
    return
  }

  if (id !== undefined && method) {
    if (method === 'textDocument/definition') {
      runWithProgress(`def-${nextTokenId++}`, () => {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            uri: `file://${targetFile}`,
            range: { start: { line: 4, character: 0 }, end: { line: 4, character: 5 } }
          }
        })
      })
      return
    }
    if (method === 'textDocument/hover') {
      send({
        jsonrpc: '2.0',
        id,
        result: { contents: { kind: 'plaintext', value: `${serverName} hover` } }
      })
      return
    }
    if (method === 'completionItem/resolve') {
      send({
        jsonrpc: '2.0',
        id,
        result: { ...params, documentation: `resolved by ${serverName}`, detail: `${serverName} detail` }
      })
      return
    }
    if (method === 'textDocument/completion') {
      send({
        jsonrpc: '2.0',
        id,
        result: [{ label: `${serverName}-item`, kind: 2 }]
      })
      return
    }
    if (method === 'textDocument/diagnostic') {
      pullCount++
      pulledUris.push(params?.textDocument?.uri ?? null)
      if (pullFails) {
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } })
        return
      }
      send({
        jsonrpc: '2.0',
        id,
        result: { kind: 'full', items: [diagItem()] }
      })
      // El server pide re-consultar: sin esto, un cliente de pull se queda con
      // la respuesta vieja (el push que avisaba ya no existe).
      if (pullRefresh && pullCount === 1) {
        send({
          jsonrpc: '2.0',
          id: `refresh-${pullCount}`,
          method: 'workspace/diagnostic/refresh'
        })
      }
      return
    }
    if (method === 'textDocument/semanticTokens/full' && semantic) {
      send({ jsonrpc: '2.0', id, result: { data: [0, 6, 3, 0, 0, 1, 4, 5, 1, 0] } })
      return
    }
    send({ jsonrpc: '2.0', id, result: null })
    return
  }

  // Notificaciones.
  if (method === 'textDocument/didOpen') {
    currentVersion = params.textDocument.version
    openCount++
    publishDiagnostics(params.textDocument.uri)
  }
  if (method === 'textDocument/didChange') {
    currentVersion = params.textDocument.version
    lastChanges = params.contentChanges
    changeCount++
    publishDiagnostics(params.textDocument.uri)
  }
  if (method === 'textDocument/didSave') {
    saveCount++
    publishDiagnostics(params.textDocument.uri)
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) break
    const header = buffer.slice(0, headerEnd).toString('utf-8')
    const match = /Content-Length: (\d+)/i.exec(header)
    if (!match) break
    const length = Number(match[1])
    if (buffer.length < headerEnd + 4 + length) break
    const body = buffer.slice(headerEnd + 4, headerEnd + 4 + length).toString('utf-8')
    buffer = buffer.slice(headerEnd + 4 + length)
    try {
      onMessage(JSON.parse(body))
    } catch (error) {
      console.error(`[mock:${serverName}] bad message`, error)
    }
  }
})

process.stdin.on('end', () => process.exit(0))

readline.createInterface({ input: process.stdin }).on('close', () => process.exit(0))
