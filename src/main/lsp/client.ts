/**
 * LSP — conexión con UN servidor.
 *
 * Réplica de client.rs del CLI: spawn stdio/socket, handshake
 * initialize→initialized→didChangeConfiguration con timeout, sync de buffers
 * full-text con versiones + didSave siempre, mapa de diagnósticos por URI,
 * shutdown ordenado (didClose todos → shutdown → exit → kill).
 *
 * Implementado sobre vscode-jsonrpc/node (la misma base que la referencia
 * opencode/MiMo-Code), corriendo en el proceso main de Electron.
 */

import { spawn, type ChildProcess } from 'child_process'
import * as net from 'net'
import * as fs from 'fs/promises'
import * as path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection
} from 'vscode-jsonrpc/node'
import type {
  LspDiagnostic,
  LspServerConfig,
  LspServerStateKind,
  DiagnosticsChangedPayload,
  LspProgressPayload
} from '@shared/lsp'

/** Diagnostic crudo del protocolo (desacoplado del typing de la lib). */
type RawDiagnostic = LspDiagnostic

import { effectiveShutdownTimeout, effectiveStartupTimeout } from './config'

export function fileUri(filePath: string): string {
  return pathToFileURL(path.resolve(filePath)).href
}

export function uriToPath(uri: string): string {
  try {
    return fileURLToPath(uri)
  } catch {
    return uri.replace(/^file:\/\//, '')
  }
}

export interface LspClientCallbacks {
  onDiagnostics(payload: DiagnosticsChangedPayload): void
  onState(state: LspServerStateKind, error?: string): void
  /** El proceso hijo terminó (crash o salida limpia). */
  onProcessExit(code: number | null): void
  /** Progreso largo ($/progress begin/report/end). */
  onProgress?(payload: LspProgressPayload): void
}

// ── Sync incremental: diff prefix/sufijo (un solo range edit) ─────────────

interface ContentChange {
  range?: { start: { line: number; character: number }; end: { line: number; character: number } }
  text: string
}

function positionAtOffset(text: string, offset: number): { line: number; character: number } {
  let line = 0
  let lastNewline = -1
  for (let i = 0; i < offset; i++) {
    if (text[i] === '\n') {
      line++
      lastNewline = i
    }
  }
  return { line, character: offset - lastNewline - 1 }
}

/** Diff mínimo: prefijo/sufijo común → UN cambio con range (estilo VS Code). */
export function computeIncrementalChange(oldText: string, newText: string): ContentChange {
  if (oldText === newText) return { text: '' }

  const min = Math.min(oldText.length, newText.length)
  let start = 0
  while (start < min && oldText[start] === newText[start]) start++

  let endOld = oldText.length
  let endNew = newText.length
  while (endOld > start && endNew > start && oldText[endOld - 1] === newText[endNew - 1]) {
    endOld--
    endNew--
  }

  return {
    range: {
      start: positionAtOffset(oldText, start),
      end: positionAtOffset(oldText, endOld)
    },
    text: newText.slice(start, endNew)
  }
}

export class LspClient {
  readonly serverName: string
  readonly lifecycleId: number
  private config: LspServerConfig
  private workspaceRoot: string
  private connection: MessageConnection | null = null
  private child: ChildProcess | null = null
  private socket: net.Socket | null = null

  /** URI → diagnósticos publicados por este server. */
  private diagnostics = new Map<string, LspDiagnostic[]>()
  /** path absoluto → { versión actual, language id }. */
  private openDocuments = new Map<string, { version: number; languageId: string }>()

  /**
   * Sync incremental (VS Code-style): si el server lo negoció, cada cambio
   * envía SOLO el diff (un range edit) en vez del texto completo.
   */
  private supportsIncremental = false
  private documentContents = new Map<string, string>()

  /** Tokens de progreso activos ($/progress). */
  private progressTokens = new Set<string>()

  private state: LspServerStateKind = 'starting'
  private callbacks: LspClientCallbacks
  private disposed = false

  constructor(
    serverName: string,
    lifecycleId: number,
    config: LspServerConfig,
    workspaceRoot: string,
    callbacks: LspClientCallbacks
  ) {
    this.serverName = serverName
    this.lifecycleId = lifecycleId
    this.config = config
    this.workspaceRoot = config.workspaceFolder ?? workspaceRoot
    this.callbacks = callbacks
  }

  getState(): LspServerStateKind {
    return this.state
  }

  /** PID del proceso hijo (undefined en transport socket). */
  get pid(): number | undefined {
    return this.child?.pid
  }

  getRoot(): string {
    return this.workspaceRoot
  }

  trackedDocuments(): Array<{ path: string; languageId: string }> {
    return [...this.openDocuments.entries()].map(([p, doc]) => ({
      path: p,
      languageId: doc.languageId
    }))
  }

  // ── Arranque ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const connection =
      this.config.transport === 'socket' ? await this.connectSocket() : await this.spawnStdio()

    this.connection = connection

    // Server → cliente: diagnósticos.
    connection.onNotification('textDocument/publishDiagnostics', (params) => {
      const filePath = uriToPath(String(params.uri))
      this.diagnostics.set(filePath, (params.diagnostics as RawDiagnostic[]) ?? [])
      this.callbacks.onDiagnostics({
        serverName: this.serverName,
        path: filePath,
        diagnostics: (params.diagnostics as RawDiagnostic[]) ?? []
      })
    })

    // Progreso largo: registrar token y difundir begin/report/end.
    connection.onRequest('window/workDoneProgress/create', (params) => {
      const token = String((params as { token?: unknown })?.token ?? '')
      if (token) this.progressTokens.add(token)
      return null
    })
    connection.onNotification('$/progress', (params) => {
      const value = params as {
        token?: unknown
        value?: { kind?: string; title?: string; message?: string; percentage?: number }
      }
      const token = String(value?.token ?? '')
      const v = value?.value ?? {}
      const phase = v.kind === 'begin' ? 'begin' : v.kind === 'end' ? 'end' : 'report'
      this.callbacks.onProgress?.({ serverName: this.serverName, token, phase, title: v.title, message: v.message, percentage: v.percentage })
      if (phase === 'end') this.progressTokens.delete(token)
    })
    connection.onRequest('workspace/configuration', () => [this.config.settings ?? {}])
    connection.onRequest('client/registerCapability', () => null)
    connection.onRequest('client/unregisterCapability', () => null)
    connection.onRequest('workspace/workspaceFolders', () => [
      { name: path.basename(this.workspaceRoot), uri: pathToFileURL(this.workspaceRoot).href }
    ])

    connection.onClose(() => {
      if (!this.disposed && this.state === 'ready') {
        this.setState('crashed', 'connection closed')
      }
    })

    connection.listen()

    // Handshake initialize con timeout (default CLI: 15 s).
    const initResult = await this.withTimeout(
      connection.sendRequest<unknown>('initialize', {
        processId: process.pid,
        rootUri: pathToFileURL(this.workspaceRoot).href,
        rootPath: this.workspaceRoot,
        workspaceFolders: [
          {
            name: path.basename(this.workspaceRoot),
            uri: pathToFileURL(this.workspaceRoot).href
          }
        ],
        initializationOptions: this.config.initializationOptions ?? {},
        capabilities: {
          window: { workDoneProgress: true },
          workspace: {
            configuration: true,
            didChangeWatchedFiles: { dynamicRegistration: true },
            workspaceFolders: true
          },
          textDocument: {
            synchronization: {
              didOpen: true,
              didChange: true,
              didSave: true,
              dynamicRegistration: false
            },
            publishDiagnostics: { relatedInformation: true, versionSupport: true },
            hover: { contentFormat: ['plaintext', 'markdown'] },
            definition: { linkSupport: false },
            references: {},
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            rename: { prepareSupport: true, prepareSupportDefaultBehavior: 1 },
            completion: {
              completionItem: {
                snippetSupport: false,
                resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] },
                labelDetailsSupport: true
              },
              contextSupport: true
            },
            signatureHelp: { signatureInformation: { documentationFormat: ['plaintext', 'markdown'] } },
            semanticTokens: { requests: { range: true, full: { delta: true } }, tokenTypes: [], tokenModifiers: [], formats: [] },
            inlayHint: { resolveSupport: { properties: ['tooltip', 'textEdits'] } },
            codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix', 'refactor', 'source'] } }, dataSupport: true },
            callHierarchy: {},
            foldingRange: {},
            selectionRange: {},
            documentHighlight: {}
          }
        }
      }),
      effectiveStartupTimeout(this.config),
      `initialize(${this.serverName})`
    )

    // Negotiation: textDocumentSync number 2 | { change: 2 } → incremental.
    const sync = (initResult as { capabilities?: { textDocumentSync?: unknown } })?.capabilities
      ?.textDocumentSync
    const changeKind =
      typeof sync === 'number' ? sync : (sync as { change?: number } | undefined)?.change
    this.supportsIncremental = changeKind === 2

    void initResult
    await connection.sendNotification('initialized', {})

    if (this.config.settings !== undefined) {
      await connection.sendNotification('workspace/didChangeConfiguration', {
        settings: this.config.settings
      })
    }

    this.setState('ready')
  }

  private async spawnStdio(): Promise<MessageConnection> {
    const child = spawn(this.config.command, this.config.args ?? [], {
      cwd: this.workspaceRoot,
      env: { ...process.env, ...(this.config.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.child = child

    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (chunk: string) => {
      console.debug(`[lsp:${this.serverName}] stderr: ${chunk.trim()}`)
    })

    child.on('exit', (code) => {
      if (!this.disposed && this.state !== 'stopped') {
        this.setState('crashed', `process exited with code ${code}`)
      }
      this.callbacks.onProcessExit(code ?? -1)
    })

    child.on('error', (error) => {
      this.setState('failed', `spawn failed: ${String(error)}`)
    })

    if (!child.stdout || !child.stdin) {
      throw new Error(`[lsp] '${this.config.command}' sin stdio`)
    }

    return createMessageConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin)
    )
  }

  private async connectSocket(): Promise<MessageConnection> {
    const [host, port] = this.config.command.split(':')
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({ host: host || '127.0.0.1', port: Number(port) }, () => resolve(s))
      s.once('error', reject)
    })
    this.socket = socket
    return createMessageConnection(new StreamMessageReader(socket), new StreamMessageWriter(socket))
  }

  // ── Sync de documentos ────────────────────────────────────────────────────

  /**
   * didOpen (primera vez) / didChange (full-text, versión incremental) +
   * didSave SIEMPRE (algunos servers solo publican diagnósticos al save).
   */
  async notifyFileChange(filePath: string, content: string, languageId: string): Promise<void> {
    const connection = this.connection
    if (!connection || this.disposed) return

    const absolute = path.resolve(filePath)
    const uri = fileUri(absolute)

    const existing = this.openDocuments.get(absolute)
    if (!existing) {
      this.openDocuments.set(absolute, { version: 0, languageId })
      this.documentContents.set(absolute, content)
      this.diagnostics.delete(absolute)
      await connection.sendNotification('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 0, text: content }
      })
    } else {
      const nextVersion = existing.version + 1
      this.openDocuments.set(absolute, { ...existing, version: nextVersion })

      const previous = this.documentContents.get(absolute) ?? ''
      const changes: ContentChange[] = this.supportsIncremental
        ? [computeIncrementalChange(previous, content)]
        : [{ text: content }]

      await connection.sendNotification('textDocument/didChange', {
        textDocument: { uri, version: nextVersion },
        contentChanges: changes
      })
      this.documentContents.set(absolute, content)
    }

    await connection.sendNotification('textDocument/didSave', {
      textDocument: { uri },
      text: content
    })
  }

  async notifyFileClosed(filePath: string): Promise<void> {
    const connection = this.connection
    if (!connection || this.disposed) return
    const absolute = path.resolve(filePath)
    if (!this.openDocuments.has(absolute)) return
    this.openDocuments.delete(absolute)
    this.diagnostics.delete(absolute)
    this.documentContents.delete(absolute)
    await connection.sendNotification('textDocument/didClose', {
      textDocument: { uri: fileUri(absolute) }
    })
  }

  /** Lee el archivo del disco y lo abre/sincroniza si no está abierto. */
  async ensureFileOpen(filePath: string, languageId: string): Promise<boolean> {
    const absolute = path.resolve(filePath)
    if (this.openDocuments.has(absolute)) return true
    try {
      const content = await fs.readFile(absolute, 'utf-8')
      await this.notifyFileChange(absolute, content, languageId)
      return true
    } catch {
      return false
    }
  }

  hasDocument(filePath: string): boolean {
    return this.openDocuments.has(path.resolve(filePath))
  }

  getDiagnostics(filePath: string): LspDiagnostic[] {
    return this.diagnostics.get(path.resolve(filePath)) ?? []
  }

  /** true si el server YA publicó diagnósticos para la ruta (aunque sean cero). */
  hasPublished(filePath: string): boolean {
    return this.diagnostics.has(path.resolve(filePath))
  }

  getAllDiagnostics(): Map<string, LspDiagnostic[]> {
    return this.diagnostics
  }

  // ── Requests ──────────────────────────────────────────────────────────────

  async request<T = unknown>(method: string, params: unknown, timeoutMs: number): Promise<T> {
    const connection = this.connection
    if (!connection || this.disposed) throw new Error(`server ${this.serverName} no disponible`)
    return this.withTimeout(connection.sendRequest<T>(method, params), timeoutMs, method)
  }

  // ── Apagado ───────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    this.disposed = true

    // didClose de todos los documentos abiertos.
    const connection = this.connection
    if (connection) {
      for (const absolute of [...this.openDocuments.keys()]) {
        try {
          await connection.sendNotification('textDocument/didClose', {
            textDocument: { uri: fileUri(absolute) }
          })
        } catch {
          // server ya caído: seguir con el shutdown igual.
        }
      }
      this.openDocuments.clear()

      try {
        await this.withTimeout(connection.sendRequest('shutdown', {}), effectiveShutdownTimeout(this.config), 'shutdown')
        await connection.sendNotification('exit')
      } catch {
        // timeout o server muerto: matar abajo.
      }
    }

    connection?.end()
    connection?.dispose()

    if (this.child) {
      const child = this.child
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          try {
            child.kill('SIGKILL')
          } catch {
            // ya muerto
          }
          resolve()
        }, effectiveShutdownTimeout(this.config))
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }

    this.socket?.destroy()
    this.setState('stopped')
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  private setState(state: LspServerStateKind, error?: string): void {
    this.state = state
    this.callbacks.onState(state, error)
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timeout ${ms}ms en ${label}`))
      }, ms)
      promise.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          clearTimeout(timer)
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      )
    })
  }
}
