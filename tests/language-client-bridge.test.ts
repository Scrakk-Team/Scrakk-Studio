// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Puente `vscode-languageclient` — la lib REAL corriendo en el Extension Host.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ PRUEBA Y POR QUÉ ASÍ
 *
 * El objetivo es que una extensión de VS Code que aporta un language server
 * funcione: eso lo hace `vscode-languageclient` (no un shim nuestro). Acá se
 * corre el host DE VERDAD (`createHostRuntime`, con el interceptor de
 * `require('vscode')` instalado), se carga una extensión de fixture desde el
 * disco que hace `require('vscode-languageclient/node')`, y esa extensión
 * arranca un client contra un server LSP real (proceso hijo, framing
 * `Content-Length`) y le manda un request propio.
 *
 * Si eso pasa, la cadena entera funciona: resolución del paquete + shim del
 * API + handshake + ida y vuelta de mensajes.
 *
 * El server de prueba es un proceso Node mínimo escrito con builtins: no
 * depende de `tools/` ni de red, así que el test es hermético.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HostEvent, HostMessage } from '../src/shared/extensionHost/protocol'
import { RpcPeer } from '../src/main/extensions/host/rpc'
import { createHostRuntime, isModuleNotFoundError } from '../src/main/extensions/host/hostProcess'
import {
  isLanguageClientRequest,
  normalizeLanguageClientRequest,
  resetLanguageClientBridge
} from '../src/main/extensions/host/languageClientBridge'
import { matchDocumentSelector } from '../src/main/extensions/host/vscodeApi'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Server LSP mínimo (builtins, sin librerías) ───────────────────────────

const SERVER_SOURCE = [
  "let buffer = ''",
  'function send(message) {',
  '  const body = JSON.stringify(message)',
  "  process.stdout.write('Content-Length: ' + Buffer.byteLength(body) + '\\r\\n\\r\\n' + body)",
  '}',
  "process.stdin.on('data', (chunk) => {",
  '  buffer += chunk.toString()',
  '  for (;;) {',
  "    const headerEnd = buffer.indexOf('\\r\\n\\r\\n')",
  '    if (headerEnd === -1) return',
  '    const match = /Content-Length: (\\d+)/i.exec(buffer.slice(0, headerEnd))',
  '    if (!match) return',
  '    const length = Number(match[1])',
  '    const start = headerEnd + 4',
  '    if (buffer.length - start < length) return',
  '    const raw = buffer.slice(start, start + length)',
  '    buffer = buffer.slice(start + length)',
  '    const message = JSON.parse(raw)',
  "    if (message.method === 'initialize') {",
  "      send({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } })",
  "    } else if (message.method === 'shutdown') {",
  "      send({ jsonrpc: '2.0', id: message.id, result: null })",
  "    } else if (message.method === 'exit') {",
  '      process.exit(0)',
  "    } else if (message.method === 'probe/ping') {",
  "      send({ jsonrpc: '2.0', id: message.id, result: 'pong' })",
  '    }',
  '  }',
  '})'
].join('\n')

/**
 * Extensión de fixture: es el código que escribiría alguien que publica un
 * LSP para VS Code. No sabe que corre en Scrakk.
 */
function extensionSource(): string {
  return [
    "const path = require('path')",
    "const vscode = require('vscode')",
    "const { LanguageClient, TransportKind } = require('vscode-languageclient/node')",
    // El server se lanza como ARCHIVO (no `-e`): la lib del protocolo agrega
    // `--stdio` a los args con `TransportKind.stdio` y `node -e … --stdio`
    // muere con "bad option". Es el patrón real (`node server.js --stdio`).
    "const SERVER = path.join(__dirname, 'server.js')",
    '',
    'exports.activate = async function () {',
    '  const client = new LanguageClient(',
    "    'probe-lsp',",
    "    'Probe LSP',",
    '    { command: process.execPath, args: [SERVER], transport: TransportKind.stdio },',
    "    { documentSelector: [{ scheme: 'file', language: 'plaintext' }] }",
    '  )',
    '  try {',
    '    await client.start()',
    "    const pong = await client.sendRequest('probe/ping')",
    "    console.log('LC-PING ' + pong)",
    "    console.log('LC-VSCODE ' + typeof vscode.languages.match)",
    '    await client.stop()',
    '  } catch (error) {',
    "    console.log('LC-ERROR ' + (error && error.message))",
    '  }',
    '}'
  ].join('\n')
}

interface HostHarness {
  main: RpcPeer
  events: Array<{ event: HostEvent; payload: unknown }>
  logs: () => string[]
  ready: Promise<void>
}

/** Host REAL: sin `loadExtension` inyectado, para que cargue del disco. */
function realHost(extensionPath: string): HostHarness {
  const holders: { main?: RpcPeer; host?: RpcPeer } = {}
  const main = new RpcPeer(
    { send: (message: HostMessage) => holders.host?.receive(message) },
    { idSign: 1, label: 'main' }
  )
  const host = new RpcPeer(
    { send: (message: HostMessage) => holders.main?.receive(message) },
    { idSign: -1, label: 'host' }
  )
  holders.main = main
  holders.host = host

  const events: Array<{ event: HostEvent; payload: unknown }> = []
  // Los listeners van ANTES de `start()`: el host saluda `ready` en el mismo
  // tick (mismo motivo que en `tests/extension-host.test.ts`).
  const ready = new Promise<void>((resolve) => main.on('ready', () => resolve()))
  for (const event of ['log', 'fatal', 'command/registered'] as HostEvent[]) {
    main.on(event, (payload) => events.push({ event, payload }))
  }
  const runtime = createHostRuntime({ peer: host })
  runtime.start()

  return {
    main,
    events,
    ready,
    logs: () =>
      events
        .filter((e) => e.event === 'log')
        .map((e) => String((e.payload as { message?: unknown }).message ?? ''))
  }
}

/**
 * Espera a que la extensión reporte por log.
 *
 * Se sondea `logs()` (el canal de log del host es síncrono en memoria) en vez
 * de enganchar un listener: así el mismo camino sirve para el éxito y para el
 * error de la extensión.
 */
function waitForLanguageClientLog(host: HostHarness, timeoutMs = 15_000): Promise<string> {
  const started = Date.now()
  return new Promise((resolve) => {
    const tick = (): void => {
      const found = host.logs().find((line) => line.startsWith('LC-'))
      if (found) {
        resolve(found)
        return
      }
      if (Date.now() - started > timeoutMs) {
        resolve('SIN LOG (timeout)')
        return
      }
      setTimeout(tick, 100)
    }
    tick()
  })
}

/** Fixture en disco: package.json + entry que usa la lib real. */
function writeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'scrakk-lsp-fixture-'))
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'probe-lsp', version: '1.0.0', main: 'extension.js' })
  )
  writeFileSync(join(dir, 'extension.js'), extensionSource())
  writeFileSync(join(dir, 'server.js'), SERVER_SOURCE)
  return dir
}

afterEach(() => {
  resetLanguageClientBridge()
})

// ── Clasificación de specifiers ───────────────────────────────────────────

describe('specifiers de vscode-languageclient', () => {
  it('reconoce el paquete y sus submódulos, y no toca otros módulos', () => {
    expect(isLanguageClientRequest('vscode-languageclient')).toBe(true)
    expect(isLanguageClientRequest('vscode-languageclient/node')).toBe(true)
    expect(isLanguageClientRequest('vscode-languageclient/browser')).toBe(true)
    expect(isLanguageClientRequest('vscode-languageserver-protocol')).toBe(false)
    expect(isLanguageClientRequest('vscode')).toBe(false)
    // Un paquete DISTINTO que empieza igual no se roba.
    expect(isLanguageClientRequest('vscode-languageclient-extra')).toBe(false)
  })

  it('el paquete desnudo apunta a la entrada de Node', () => {
    expect(normalizeLanguageClientRequest('vscode-languageclient')).toBe(
      'vscode-languageclient/node'
    )
    expect(normalizeLanguageClientRequest('vscode-languageclient/node')).toBe(
      'vscode-languageclient/node'
    )
  })
})

// ── El respaldo no tapa el error de la extensión ──────────────────────────

describe('detección de módulo faltante', () => {
  it('sólo responde por el specifier pedido, no por una dependencia rota', () => {
    const notFound = (message: string): Error => {
      const error = new Error(message) as Error & { code?: string }
      error.code = 'MODULE_NOT_FOUND'
      return error
    }
    expect(
      isModuleNotFoundError(
        notFound("Cannot find module 'vscode-languageclient/node'"),
        'vscode-languageclient/node'
      )
    ).toBe(true)
    // La extensión trae el paquete y le falta una dependencia SUYA: el
    // respaldo no debe esconder ese error.
    expect(
      isModuleNotFoundError(
        notFound("Cannot find module 'minimatch'"),
        'vscode-languageclient/node'
      )
    ).toBe(false)
    expect(isModuleNotFoundError(new Error('otra cosa'), 'x')).toBe(false)
  })
})

// ── `languages.match` (lo que la lib usa para decidir didOpen) ────────────

describe('languages.match', () => {
  const doc = { languageId: 'typescript', fileName: '/w/src/a.ts' }

  it('matchea por lenguaje suelto y por filtro', () => {
    expect(matchDocumentSelector('typescript', doc)).toBeGreaterThan(0)
    expect(matchDocumentSelector('python', doc)).toBe(0)
    expect(matchDocumentSelector({ language: 'typescript' }, doc)).toBeGreaterThan(0)
    expect(matchDocumentSelector({ language: 'python' }, doc)).toBe(0)
  })

  it('el scheme sin URI se asume file', () => {
    expect(matchDocumentSelector({ language: 'typescript', scheme: 'file' }, doc)).toBe(2)
    expect(matchDocumentSelector({ language: 'typescript', scheme: 'untitled' }, doc)).toBe(0)
  })

  it('un glob sin barra es sobre el NOMBRE y con barra sobre la ruta', () => {
    expect(matchDocumentSelector({ pattern: '*.ts' }, doc)).toBeGreaterThan(0)
    expect(matchDocumentSelector({ pattern: '*.py' }, doc)).toBe(0)
    expect(matchDocumentSelector({ pattern: 'src/*.ts' }, doc)).toBeGreaterThan(0)
    expect(matchDocumentSelector({ pattern: 'other/*.ts' }, doc)).toBe(0)
  })

  it('en una LISTA gana la entrada que más criterios cumple', () => {
    const score = matchDocumentSelector(
      ['python', { language: 'typescript', scheme: 'file' }, { language: 'typescript' }],
      doc
    )
    expect(score).toBe(2)
  })

  it('un selector vacío matchea (la lib pregunta con `> 0`)', () => {
    expect(matchDocumentSelector({}, doc)).toBeGreaterThan(0)
    expect(matchDocumentSelector([], doc)).toBe(0)
    expect(matchDocumentSelector(null, doc)).toBe(0)
    expect(matchDocumentSelector({ language: 'typescript' }, null)).toBe(0)
  })
})

// ── La prueba de verdad: la lib REAL, en el host REAL ─────────────────────

describe('LanguageClient real sobre el host', () => {
  it(
    'una extensión arranca su server y recibe la respuesta del request',
    async () => {
      const extensionPath = writeFixture()
      const host = realHost(extensionPath)
      await host.ready
      await host.main.request('init', {
        extensionId: 'probe.lsp',
        extensionPath,
        entry: 'extension.js',
        workspaceRoots: [extensionPath],
        permissions: [],
        mode: 'strict'
      })

      // NO se espera a `activate`: si el handshake se cuelga, el test tiene que
      // decir QUÉ log salió en vez de morir por timeout sin evidencia.
      const activation = host.main
        .request('activate')
        .then(() => 'activation OK')
        .catch((error: Error) => `activation FALLÓ: ${error.message}`)
      const outcome = await Promise.race([
        waitForLanguageClientLog(host),
        activation,
        new Promise<string>((resolve) => setTimeout(() => resolve('SIN LOG (timeout)'), 15_000))
      ])

      const logs = host.logs()
      const detail = `resultado: ${outcome}\nlogs del host:\n${logs.join('\n')}`
      expect(outcome, detail).not.toBe('SIN LOG (timeout)')
      expect(logs.filter((line) => line.startsWith('LC-ERROR')), detail).toEqual([])
      expect(logs.some((line) => line.includes('LC-PING pong')), detail).toBe(true)
      expect(logs.some((line) => line.includes('LC-VSCODE function')), detail).toBe(true)

      // El interceptor de módulos se restaura al desactivar (no contamina
      // al resto del proceso con los hooks parcheados).
      await host.main.request('deactivate')
    },
    40_000
  )
})
