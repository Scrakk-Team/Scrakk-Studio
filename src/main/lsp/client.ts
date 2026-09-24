// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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
import type { Message } from 'vscode-jsonrpc'

/** Writer que no tumba el proceso si el stream ya murió (kill del hijo). */
class SafeStreamMessageWriter extends StreamMessageWriter {
  override write(message: Message): Promise<void> {
    try {
      const result = super.write(message) as unknown
      if (result instanceof Promise) {
        // El rechazo interno (stream muerto) no puede quedar sin handler.
        return result.catch(() => undefined)
      }
      return Promise.resolve()
    } catch {
      // throw sincrónico por stream destruido.
      return Promise.resolve()
    }
  }
}
import type {
  LspDiagnostic,
  LspServerConfig,
  LspServerStateKind,
  DiagnosticsChangedPayload,
  LspProgressPayload
} from '@shared/lsp'

/** Diagnostic crudo del protocolo (desacoplado del typing de la lib). */
type RawDiagnostic = LspDiagnostic

/**
 * Latencia del pull de diagnósticos (`textDocument/diagnostic`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTO
 *
 * Los servers de CSS/HTML/JSON **no** mandan los diagnósticos cuando tipeás:
 * `registerDiagnosticsPushSupport` los agenda con un debounce de 500 ms FIJO
 * (`var validationDelayMs = 500`) que se reinicia con cada cambio. Resultado:
 * el subrayado (y el chip de Problemas) aparece ~650 ms después de la última
 * tecla, y si tocás algo antes, esa validación se CANCELA.
 *
 * Al anunciar la capability `textDocument.diagnostic` (LSP 3.17), esos mismos
 * servers registran `registerDiagnosticsPullSupport`: ahí `validate(document)`
 * corre **sin espera** y el cliente decide cuándo preguntar. VS Code hace
 * exactamente esto, y es la razón por la que allí se siente inmediato.
 *
 * `PULL_MIN_INTERVAL_MS` es el cap por documento: el primer cambio después de
 * una pausa sale YA (latencia mínima) y una ráfaga se agrupa, así que no se
 * manda un request por tecla. Nuestro renderer ya coalesce a 40 ms.
 */
const PULL_MIN_INTERVAL_MS = 180
/** Timeout del request de pull (un server colgado no puede dejar el archivo sin diagnósticos). */
const PULL_TIMEOUT_MS = 15_000

/** `MethodNotFound` (-32601): el server anunció pull y no lo atiende. */
function isMethodNotFound(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code
  if (code === -32601) return true
  return error instanceof Error && /method not found/i.test(error.message)
}

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
  onProcessExit(code: number | null, stderrTail?: string): void
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

/**
 * Diff mínimo: prefijo/sufijo común → UN cambio con range (estilo VS Code).
 *
 * Devuelve `null` cuando el texto NO cambió, y no es un detalle: en LSP un
 * cambio **sin `range`** significa "reemplazá TODO el documento por este texto".
 * Devolver `{ text: '' }` para un texto idéntico mandaba
 * `contentChanges: [{text: ''}]` —o sea **vaciar** el documento del server—.
 *
 * Consecuencia medida con el probe `tools/_probe-lsp-realtime.mjs`: el sync
 * re-manda el contenido al GUARDAR (es el mismo texto), así que el server
 * publicaba 0 diagnósticos y el subrayado y el chip de Problemas se vaciaban
 * con el archivo todavía roto. Y peor: el server quedaba desincronizado (creía
 * el documento vacío y el cliente creía tenerlo completo), así que los diffs
 * siguientes se aplicaban sobre un documento fantasma.
 */
export function computeIncrementalChange(oldText: string, newText: string): ContentChange | null {
  if (oldText === newText) return null

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

  /**
   * El server atiende `textDocument/diagnostic` (su `diagnosticProvider` lo
   * declara). Se APAGA si el request contesta `MethodNotFound`: sin esa válvula
   * un server que lo anuncia y no lo implementa dejaría sus archivos sin
   * diagnósticos para siempre (el push ya no manda nada cuando el cliente
   * anuncia la capability).
   */
  private supportsPullDiagnostics = false
  /** Pull agendado por documento (ver `schedulePull`). */
  private pullTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Cuándo se pidió pull por última vez (leading edge del cap). */
  private lastPullAt = new Map<string, number>()
  /** Documentos con un pull en vuelo: una consulta a la vez por documento. */
  private pullInFlight = new Set<string>()

  /** Tokens de progreso activos ($/progress). */
  private progressTokens = new Set<string>()

  private state: LspServerStateKind = 'starting'
  private stderrTail = ''
  /** El proceso hijo ya murió: bloquea writes sobre streams destruidos. */
  private processDead = false
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

    // Server → cliente: diagnósticos por PUSH (servers sin pull).
    connection.onNotification('textDocument/publishDiagnostics', (params) => {
      this.applyDiagnostics(uriToPath(String(params.uri)), (params.diagnostics as RawDiagnostic[]) ?? [], 'push')
    })

    // El server pide re-consultar (pull): con pull NO avisa cuándo cambió un
    // documento, así que ésta es la única señal para refrescar (archivos
    // vigilados, configuración, dependencias). Se re-piden los abiertos.
    connection.onRequest('workspace/diagnostic/refresh', () => {
      for (const absolute of this.openDocuments.keys()) this.schedulePull(absolute)
      return null
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

    // Writes sobre un stream destruido (hijo muerto de golpe, ej. kill)
    // no deben tumbar el proceso con un unhandled error.
    connection.onError(() => {
      this.processDead = true
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
            /**
             * Pull de diagnósticos. No es un detalle: los servers de
             * CSS/HTML/JSON cambian TODA su validación al ver esta capability
             * (push con 500 ms fijos → pull sin espera). Ver `PULL_MIN_INTERVAL_MS`.
             */
            diagnostic: { dynamicRegistration: false, relatedDocumentSupport: false },
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

    // ¿Atiende pull? Su `diagnosticProvider` ES la declaración (LSP 3.17).
    const provider = (initResult as { capabilities?: { diagnosticProvider?: unknown } })
      ?.capabilities?.diagnosticProvider
    this.supportsPullDiagnostics = Boolean(provider)

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
      // Cola corta para diagnóstico (status/modal muestran el porqué).
      this.stderrTail = (this.stderrTail + chunk).split('\n').slice(-12).join('\n').slice(-1200)
      console.debug(`[lsp:${this.serverName}] stderr: ${chunk.trim()}`)
    })

    child.on('exit', (code) => {
      this.processDead = true
      if (!this.disposed && this.state !== 'stopped') {
        const tail = this.stderrTail.trim()
        const detail = tail.length > 0 ? `process exited (${code}): ${tail}` : `process exited with code ${code}`
        this.setState('crashed', detail)
      }
      this.callbacks.onProcessExit(code ?? -1, this.stderrTail.trim())
    })

    child.on('error', (error) => {
      this.setState('failed', `spawn failed: ${String(error)}`)
    })

    if (!child.stdout || !child.stdin) {
      throw new Error(`[lsp] '${this.config.command}' sin stdio`)
    }

    // Un write/read sobre stream destruido (hijo muerto de golpe, ej. kill)
    // emite 'error' async en el propio stream: sin handler sería unhandled.
    child.stdin.on('error', () => {})
    child.stdout.on('error', () => {})

    return createMessageConnection(
      new StreamMessageReader(child.stdout),
      new SafeStreamMessageWriter(child.stdin)
    )
  }

  private async connectSocket(): Promise<MessageConnection> {
    const [host, port] = this.config.command.split(':')
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({ host: host || '127.0.0.1', port: Number(port) }, () => resolve(s))
      s.once('error', reject)
    })
    this.socket = socket
    return createMessageConnection(new StreamMessageReader(socket), new SafeStreamMessageWriter(socket))
  }

  // ── Diagnósticos ──────────────────────────────────────────────────────────

  /**
   * Guarda los diagnósticos de UN documento y los empuja al host.
   *
   * Único camino de escritura: push y pull terminan aquí, así que lo que ve el
   * editor no depende de por dónde llegó.
   */
  private applyDiagnostics(
    filePath: string,
    diagnostics: RawDiagnostic[],
    origin: 'push' | 'pull'
  ): void {
    const absolute = path.resolve(filePath)
    if (process.env.SCRAKK_LSP_DEBUG)
      console.log(
        `[lspdbg] ${Date.now()} ${origin} ${path.basename(absolute)} ${diagnostics.length} ${JSON.stringify(diagnostics.map((d) => d.message))}`
      )
    this.diagnostics.set(absolute, diagnostics)
    this.callbacks.onDiagnostics({
      serverName: this.serverName,
      path: absolute,
      diagnostics
    })
  }

  /**
   * Pide diagnósticos AHORA si hace rato que no se pide; si estamos en ráfaga,
   * agenda uno al final de la ventana.
   *
   * Mismo criterio que el sync del renderer (leading edge + cap) para que la
   * primera tecla después de una pausa tenga latencia mínima: en vez de
   * esperar los 500 ms del push, el server contesta en ~10-40 ms.
   */
  private schedulePull(absolute: string): void {
    if (!this.supportsPullDiagnostics || this.disposed || this.processDead) return
    if (!this.openDocuments.has(absolute)) return
    if (this.pullTimers.has(absolute) || this.pullInFlight.has(absolute)) return
    const waited = Date.now() - (this.lastPullAt.get(absolute) ?? 0)
    if (waited >= PULL_MIN_INTERVAL_MS) {
      void this.pullDiagnostics(absolute)
      return
    }
    const timer = setTimeout(() => {
      this.pullTimers.delete(absolute)
      void this.pullDiagnostics(absolute)
    }, PULL_MIN_INTERVAL_MS - waited)
    // Un timer pendiente no puede mantener vivo el proceso al cerrar la app.
    timer.unref?.()
    this.pullTimers.set(absolute, timer)
  }

  /** `textDocument/diagnostic` para un documento abierto. */
  private async pullDiagnostics(absolute: string): Promise<void> {
    const connection = this.connection
    if (!connection || this.disposed || this.processDead) return
    if (!this.supportsPullDiagnostics || !this.openDocuments.has(absolute)) return
    if (this.pullInFlight.has(absolute)) return
    this.pullInFlight.add(absolute)
    this.lastPullAt.set(absolute, Date.now())
    try {
      const report = await this.withTimeout(
        connection.sendRequest<{ kind?: string; items?: RawDiagnostic[] }>(
          'textDocument/diagnostic',
          { textDocument: { uri: fileUri(absolute) } }
        ),
        PULL_TIMEOUT_MS,
        `textDocument/diagnostic(${this.serverName})`
      )
      // `full` trae la lista completa; `unchanged` (con `resultId`) significa
      // "sigue igual": no hay nada que reemplazar.
      if (report?.kind === 'full') this.applyDiagnostics(absolute, report.items ?? [], 'pull')
    } catch (error) {
      if (isMethodNotFound(error)) this.supportsPullDiagnostics = false
    } finally {
      this.pullInFlight.delete(absolute)
    }
  }

  /** Suelta el pull agendado de un documento (cierre, shutdown). */
  private clearPull(absolute: string): void {
    const timer = this.pullTimers.get(absolute)
    if (timer) clearTimeout(timer)
    this.pullTimers.delete(absolute)
    this.lastPullAt.delete(absolute)
    this.pullInFlight.delete(absolute)
  }

  // ── Sync de documentos ────────────────────────────────────────────────────

  /**
   * didOpen (primera vez) / didChange (full-text, versión incremental) +
   * didSave SIEMPRE (algunos servers solo publican diagnósticos al save).
   */
  async notifyFileChange(filePath: string, content: string, languageId: string): Promise<void> {
    const connection = this.connection
    if (!connection || this.disposed || this.processDead) return

    const absolute = path.resolve(filePath)
    const uri = fileUri(absolute)
    if (process.env.SCRAKK_LSP_DEBUG)
      console.log(
        `[lspdbg] ${Date.now()} notify ${path.basename(absolute)} v=${this.openDocuments.get(absolute)?.version ?? -1} ${content.length} chars tail=${JSON.stringify(content.slice(-14))}`
      )

    const existing = this.openDocuments.get(absolute)
    const previous = this.documentContents.get(absolute)
    if (!existing) {
      this.openDocuments.set(absolute, { version: 0, languageId })
      this.documentContents.set(absolute, content)
      this.diagnostics.delete(absolute)
      await connection.sendNotification('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 0, text: content }
      })
    } else if (previous === content) {
      // Mismo texto: NO se manda `didChange`. Un cambio sin `range` reemplaza el
      // documento ENTERO, y mandar uno vacío lo borraba en el server (ver
      // `computeIncrementalChange`). Sin cambios no hay nada que sincronizar:
      // la versión tampoco avanza.
    } else {
      const nextVersion = existing.version + 1
      this.openDocuments.set(absolute, { ...existing, version: nextVersion })

      const incremental = this.supportsIncremental
        ? computeIncrementalChange(previous ?? '', content)
        : null
      const changes: ContentChange[] = incremental ? [incremental] : [{ text: content }]

      await connection.sendNotification('textDocument/didChange', {
        textDocument: { uri, version: nextVersion },
        contentChanges: changes
      })
      this.documentContents.set(absolute, content)
    }

    // didSave sin texto: el contenido ya viajó en didOpen/didChange justo
    // arriba (algunos servers solo publican diagnósticos al save, pero no
    // necesitan el texto duplicado: `text` es opcional en LSP). Ahorra una
    // copia full-text por keystroke en el payload IPC.
    await connection.sendNotification('textDocument/didSave', {
      textDocument: { uri }
    })

    // Y si el server soporta pull, se le PREGUNTA en vez de esperar su push
    // (CSS/HTML/JSON tienen 500 ms fijos de retardo en el camino de push).
    this.schedulePull(absolute)
  }

  async notifyFileClosed(filePath: string): Promise<void> {
    const connection = this.connection
    if (!connection || this.disposed) return
    const absolute = path.resolve(filePath)
    if (!this.openDocuments.has(absolute)) return
    this.openDocuments.delete(absolute)
    const hadDiagnostics = this.diagnostics.delete(absolute)
    this.documentContents.delete(absolute)
    this.clearPull(absolute)
    await connection.sendNotification('textDocument/didClose', {
      textDocument: { uri: fileUri(absolute) }
    })
    // Con PUSH el server manda el `[]` al cerrar; con PULL nadie lo haría y el
    // archivo cerrado dejaría problemas fantasma en el panel y en el chip.
    if (hadDiagnostics) this.applyDiagnostics(absolute, [], 'pull')
  }

  /** Lee el archivo del disco y lo abre/sincroniza si no está abierto. */
  async ensureFileOpen(filePath: string, languageId: string): Promise<boolean> {
    if (this.processDead) return false
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
    if (!connection || this.disposed || this.processDead) {
      throw new Error(`server ${this.serverName} no disponible`)
    }
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
      // Vaciar TODOS los maps (documentContents/diagnostics retenían el texto
      // completo de cada archivo tras el shutdown) y los pull agendados.
      this.documentContents.clear()
      this.diagnostics.clear()
      for (const timer of this.pullTimers.values()) clearTimeout(timer)
      this.pullTimers.clear()
      this.lastPullAt.clear()
      this.pullInFlight.clear()
      this.progressTokens.clear()

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
