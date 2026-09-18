/**
 * Manager del Extension Host (proceso main).
 *
 * Un proceso de extensión por cada extensión que la necesite: `utilityProcess`
 * de Electron, aislado del renderer y sin acceso a la UI. El manager es el
 * ÚNICO que decide qué se concede: valida el filesystem contra los permisos
 * declarados y el workspace abierto, y rutea comandos/notificaciones a los
 * registries REALES del IDE (vía el renderer).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * `spawnHost` es la costura: hoy usa `utilityProcess.fork`. Cuando Owear
 * cambie el runtime de ejecución se reemplaza ESA función y se conserva todo
 * el resto (permisos, ruteo, caché de webviews).
 */

import { app, utilityProcess } from 'electron'
import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { createHash } from 'node:crypto'
import { hostname } from 'node:os'
import { join, relative, sep } from 'node:path'
import { resolveSpawnEntry } from '../spawnEntry'
import { SKIPPED_DIRS, matchesGlob } from './host/globs'
import { ExtensionStorage } from './extensionStorage'
import {
  HOST_PROTOCOL_VERSION,
  type CommandRegisteredPayload,
  type DocumentEvent,
  type DocumentSelection,
  type DocumentSnapshot,
  type ExtensionEnvInfo,
  type ExtensionHostMode,
  type ExtensionStoragePaths,
  type FatalPayload,
  type FileStatModel,
  type FileTypeModel,
  type FsReadDirectoryResult,
  type FsStatResult,
  type MementoScope,
  type FindFilesResult,
  type FsResultLike,
  type HostMessage,
  type LogPayload,
  type MainEvent,
  type NotifyPayload,
  type NotifyResult,
  type ProviderQueryParams,
  type ProviderQueryResult,
  type ViewHtmlPayload,
  type ViewPostPayload,
  type ViewTitlePayload,
  type TreeNodeModel
} from '@shared/extensionHost/protocol'
import { checkPathAccess } from '@shared/permissions'
import { RpcPeer } from './host/rpc'

// ── Costuras inyectables (para tests) ─────────────────────────────────────

/**
 * Canal con el proceso de la extensión.
 *
 * OJO con la asimetría (fácil de confundir y silenciosa): del lado del MAIN
 * el listener de `message` recibe EL MENSAJE; del lado del HOST,
 * `process.parentPort` recibe un evento con `.data`. Si se mezclan, el host
 * "nunca saluda" y parece un cuelgue.
 */
export interface HostProcessLike {
  postMessage(message: unknown): void
  on(event: 'message', listener: (message: unknown) => void): void
  on(event: 'exit', listener: (code: number) => void): void
  kill(): void
}

export type HostSpawner = (entryPath: string) => HostProcessLike

/**
 * Puente hacia el renderer para las cosas que viven en la UI (registry de
 * comandos y notificaciones reales del IDE). Se inyecta para poder testear
 * el manager sin Electron.
 */
export interface RendererInvoker {
  invoke(method: string, params: unknown, timeoutMs?: number): Promise<unknown>
}

export interface HostActivationRequest {
  extensionId: string
  /** Directorio absoluto del paquete instalado. */
  extensionPath: string
  /** Entry Node relativo al paquete (manifest `runtime.entry`). */
  entry: string
  /** Roots del workspace abierto. */
  workspaceRoots: string[]
  /** Permisos declarados por la extensión. */
  permissions: string[]
  mode: ExtensionHostMode
  configurationDefaults?: Record<string, unknown>
}

export interface WebviewRecord {
  html: string
  title: string
}

export interface HostEventSink {
  /** Se emite cuando el host publica/bloquea algo que la UI debe reflejar. */
  onHostEvent(extensionId: string, event: string, payload: unknown): void
  /** El proceso murió (la UI debe limpiar la vista). */
  onHostExit(extensionId: string, code: number, reason: string): void
}

export interface HostManagerOptions {
  spawn?: HostSpawner
  renderer: RendererInvoker
  sink: HostEventSink
  /** Home del usuario (jail de rutas sensibles). Inyectable en tests. */
  homeDir?: string
  /** Almacén de estado/secretos/ajustes de las extensiones. */
  storage?: ExtensionStorage
  /** Datos del IDE para `env` (`appRoot`, idioma...). Inyectable en tests. */
  envInfo?: Partial<ExtensionEnvInfo>
}

/**
 * Comandos built-in de VS Code que el IDE RESUELVE ÉL MISMO.
 *
 * `setContext` es el caso testigo: es lo PRIMERO que espera una extensión al
 * activar (Cline lo llama 37 veces), es síncrono desde el punto de vista de la
 * extensión y no puede depender de la UI. Si no está, la activación muere o
 * queda colgada sin decir nada.
 */
export const BUILTIN_COMMANDS = {
  SET_CONTEXT: 'setContext',
  /** Abre un archivo/URI en el editor (lo rutea el renderer). */
  VSCODE_OPEN: 'vscode.open',
  /** Revela el contenedor de una extensión en la activity bar. */
  VIEW_EXTENSION: 'workbench.view.extension'
} as const

interface HostSession {
  id: string
  peer: RpcPeer
  child: HostProcessLike
  request: HostActivationRequest
  ready: Promise<void>
  activated: boolean
  /** HTML + título por vista, para el protocolo del webview. */
  views: Map<string, WebviewRecord>
  /** HTML de los paneles del editor (`panel:<ext>#<n>`), mismo protocolo. */
  panels: Map<string, WebviewRecord>
  /** Comandos que la extensión registró (los puenteamos al IDE). */
  commands: Set<string>
  /** Rechaza la espera de `ready` si el proceso muere antes de saludar. */
  failReady?: (error: Error) => void
  /**
   * Peticiones del host que todavía están esperando respuesta de la UI
   * (o del disco). Se usan para que un `activate` que expira diga QUÉ quedó
   * colgado en vez de un timeout pelado: "no respondió en 30 s" no le sirve a
   * nadie para arreglar nada (ver el caso de Cline).
   */
  pendingCalls: Set<string>
  /** Directorios propios de la extensión (jail + `context.*StorageUri`). */
  storagePaths?: ExtensionStoragePaths
  /** ¿Alguien pidió que no se relance solo? */
  disposed: boolean
  /** Corrida de `activate` en curso/terminada (nunca se repite). */
  activation?: Promise<string[]>
}

/** Piezas que el main resuelve antes de `init` (ver `activationParams`). */
interface HostInitExtras {
  storage: ExtensionStoragePaths
  globalState: Record<string, unknown>
  workspaceState: Record<string, unknown>
  configurationValues: Record<string, unknown>
  packageJSON: Record<string, unknown>
  esm: boolean
  env: ExtensionEnvInfo
}

/** Lee el `package.json` del paquete instalado ({} si no se puede). */
async function readPackageJson(extensionPath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(join(extensionPath, 'package.json'), 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * ¿El entry se cargar con `import()`?
 * Misma regla que VS Code (`_isESM`): `.mjs`, o `type: "module"` salvo `.cjs`.
 */
export function isEsmEntry(entry: string, packageJSON: Record<string, unknown>): boolean {
  if (entry.endsWith('.mjs')) return true
  if (entry.endsWith('.cjs')) return false
  return packageJSON['type'] === 'module'
}

/**
 * Shell del sistema (`env.shell`).
 *
 * En Windows el shell es `ComSpec` (`cmd.exe`); en el resto es `SHELL`. Si no
 * se puede saber, queda `undefined` — que es la verdad: una extensión que
 * usa este dato para ofrecer su integración prefiere no ofrecerla antes que
 * escribir en un shell inventado.
 */
function systemShell(): string | undefined {
  if (process.platform === 'win32') return process.env.ComSpec ?? undefined
  return process.env.SHELL ?? undefined
}

/** Id de máquina estable (hostname + plataforma). No es un secreto. */
function machineId(): string {
  return createHash('sha256')
    .update(`${hostname()}|${process.platform}|${process.arch}`)
    .digest('hex')
    .slice(0, 32)
}

/** Helper para los handlers de fs: mensaje de error legible. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** `Dirent` → `vscode.FileType` (symlink incluido). */
function direntType(entry: Dirent): FileTypeModel {
  if (entry.isSymbolicLink()) return 64
  if (entry.isDirectory()) return 2
  if (entry.isFile()) return 1
  return 0
}

/** `fs.Stats` → `FileStat` serializable. */
function toFileStat(stats: { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean; ctimeMs: number; mtimeMs: number; size: number }): FileStatModel {
  const type: FileTypeModel = stats.isSymbolicLink()
    ? 64
    : stats.isDirectory()
      ? 2
      : stats.isFile()
        ? 1
        : 0
  return {
    type,
    ctime: Math.floor(stats.ctimeMs),
    mtime: Math.floor(stats.mtimeMs),
    size: stats.size
  }
}

// ── Spawn real ────────────────────────────────────────────────────────────

/**
 * Ruta del bundle del host (hermano del bundle del main).
 *
 * `resolveSpawnEntry` la busca en `app.asar.unpacked` cuando la app está
 * empaquetada: un script que se lanza con `utilityProcess.fork` tiene que ser un
 * archivo REAL, no una ruta virtual dentro del asar (ver `spawnEntry.ts`).
 */
export function hostEntryPath(): string {
  return resolveSpawnEntry('extension-host.js')
}

function defaultSpawn(entryPath: string): HostProcessLike {
  const child = utilityProcess.fork(entryPath, [], {
    serviceName: 'scrakk-extension-host',
    // `pipe` (no `inherit`) y se reenvía a mano: el CANAL es `parentPort`, no
    // stdio, así que una extensión puede escribir libremente sin corromper el
    // protocolo — y su salida se ve. Sin esto, un host que muere al arrancar
    // no dice POR QUÉ y sólo se ve un timeout que parece un cuelgue.
    stdio: 'pipe'
  })
  child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk))
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk))
  return {
    postMessage: (message) => child.postMessage(message),
    on: (event, listener) => {
      if (event === 'message') {
        child.on('message', listener as (message: unknown) => void)
      } else {
        child.on('exit', listener as (code: number) => void)
      }
    },
    kill: () => child.kill()
  }
}

// ── Manager ───────────────────────────────────────────────────────────────

export class ExtensionHostManager {
  private readonly sessions = new Map<string, HostSession>()
  private readonly spawn: HostSpawner
  private readonly renderer: RendererInvoker
  private readonly sink: HostEventSink
  private readonly homeDir: string
  private readonly storage: ExtensionStorage
  private readonly envInfo: Partial<ExtensionEnvInfo>
  /** Claves de contexto puestas con `setContext` (por extensión). */
  private readonly contextKeys = new Map<string, Map<string, unknown>>()
  /**
   * Estado del editor que el RENDERER empuja acá. El manager lo guarda por dos
   * razones: (1) un host que arranca después recibe el snapshot completo en
   * `init` (la extensión ve los documentos desde `activate`), y (2) el main no
   * necesita despertar a nadie para responder eso.
   */
  private readonly documents = new Map<string, DocumentSnapshot>()
  private activeDocument: string | null = null
  private activeSelection: DocumentSelection | undefined

  constructor(options: HostManagerOptions) {
    this.spawn = options.spawn ?? defaultSpawn
    this.renderer = options.renderer
    this.sink = options.sink
    this.homeDir = options.homeDir ?? app.getPath('home')
    this.storage =
      options.storage ??
      new ExtensionStorage({ baseDir: join(app.getPath('userData'), 'User') })
    this.envInfo = options.envInfo ?? {}
  }

  /**
   * Lo que una extensión recibe en `init` para arrancar como en VS Code:
   * storage ya creado, estado ya leído y sus datos de paquete.
   *
   * Deliberadamente TODO se resuelve acá (main) y viaja hecho: el host no toca
   * el disco ni decide rutas.
   */
  private async activationParams(
    request: HostActivationRequest
  ): Promise<HostInitExtras> {
    const workspaceRoot = request.workspaceRoots[0] ?? null
    const storage = await this.storage.ensurePaths(request.extensionId, workspaceRoot)
    const [globalState, workspaceState, configurationValues, packageJSON] = await Promise.all([
      this.storage.readState(request.extensionId, 'global', null),
      this.storage.readState(request.extensionId, 'workspace', workspaceRoot),
      this.storage.readConfiguration(workspaceRoot),
      readPackageJson(request.extensionPath)
    ])
    return {
      storage,
      globalState,
      workspaceState,
      configurationValues,
      packageJSON,
      esm: isEsmEntry(request.entry, packageJSON),
      env: {
        appName: this.envInfo.appName ?? 'Scrakk Studio',
        appRoot: this.envInfo.appRoot ?? app.getAppPath(),
        machineId: this.envInfo.machineId ?? machineId(),
        language: this.envInfo.language ?? 'es',
        uriScheme: this.envInfo.uriScheme ?? 'scrakk-ext',
        // Estado REAL del ajuste (el renderer lo publica al arrancar y en
        // cada cambio; ver `setTelemetryEnabled`). Default: apagada.
        isTelemetryEnabled: this.envInfo.isTelemetryEnabled === true,
        shell: this.envInfo.shell ?? systemShell()
      }
    }
  }

  /**
   * Ajuste de telemetría del IDE: lo publica el renderer (dueño del ajuste).
   *
   * Se guarda para que TODO host que arranque después reciba el valor bueno en
   * su `init` (una extensión lee `env.isTelemetryEnabled` al activar, y el
   * primer arranque es justo el momento en que el dato importa) y se empuja a
   * los hosts vivos por `env/telemetry`, que dispara
   * `env.onDidChangeTelemetryEnabled`.
   */
  setTelemetryEnabled(enabled: boolean): void {
    if (this.envInfo.isTelemetryEnabled === enabled) return
    this.envInfo.isTelemetryEnabled = enabled
    for (const session of this.sessions.values()) {
      if (session.disposed) continue
      session.peer.emit('env/telemetry' as MainEvent, { enabled })
    }
  }

  /** ¿Hay un host vivo para esa extensión? */
  hasHost(extensionId: string): boolean {
    const session = this.sessions.get(extensionId)
    return Boolean(session && !session.disposed)
  }

  /** Ids de los hosts VIVOS y ya activados (los que pueden opinar del editor). */
  activeHostIds(): string[] {
    return [...this.sessions.values()]
      .filter((session) => !session.disposed && session.activated)
      .map((session) => session.id)
  }

  /**
   * Consulta un proveedor de lenguaje del host de esa extensión.
   *
   * Sin `activated` no hay proveedores registrados (se registran en
   * `activate()`), así que se responde "no opino" en vez de despertar al host.
   */
  async queryProvider(
    extensionId: string,
    params: ProviderQueryParams
  ): Promise<ProviderQueryResult> {
    const session = this.sessions.get(extensionId)
    if (!session || session.disposed || !session.activated) {
      return { matched: false, result: null }
    }
    // Timeout propio (el peer ya tiene el suyo, más generoso): un provider
    // colgado no puede colgar el hover de TODA la app.
    return await session.peer.request<ProviderQueryResult>('provider/query', params, 4000)
  }

  /** Lista de comandos que el host de esa extensión declaró tener. */
  commandsOf(extensionId: string): string[] {
    return [...(this.sessions.get(extensionId)?.commands ?? [])]
  }

  /** Ids de las vistas que ya publicaron contenido. */
  resolvedViews(extensionId: string): string[] {
    return [...(this.sessions.get(extensionId)?.views.keys() ?? [])]
  }

  /** Vista cacheada (el protocolo `scrakk-ext:` la sirve). */
  viewOf(extensionId: string, viewId: string): WebviewRecord | undefined {
    return this.sessions.get(extensionId)?.views.get(viewId)
  }

  /** HTML de un panel del editor (lo sirve el mismo `scrakk-ext:`). */
  panelOf(extensionId: string, panelId: string): WebviewRecord | undefined {
    return this.sessions.get(extensionId)?.panels.get(panelId)
  }

  // ── Documentos del editor ──────────────────────────────────────────────

  /**
   * Aplica hechos del editor venidos del renderer: actualiza el snapshot local
   * y se los cuenta a TODOS los hosts vivos (una extensión puede estar mirando
   * el mismo archivo que otra).
   */
  applyDocumentEvents(events: DocumentEvent[]): void {
    for (const event of events) {
      if (event.kind === 'open' || event.kind === 'change') {
        this.documents.set(event.document.path, event.document)
      } else if (event.kind === 'close') {
        this.documents.delete(event.path)
        if (this.activeDocument === event.path) this.activeDocument = null
      } else if (event.kind === 'save') {
        const current = this.documents.get(event.path)
        if (current) this.documents.set(event.path, { ...current, dirty: false, version: event.version })
      } else if (event.kind === 'active') {
        this.activeDocument = event.path
        this.activeSelection = event.selection
      }

      // El host recibe el nombre del evento tal cual (`doc/open`, `doc/change`…).
      for (const session of this.sessions.values()) {
        if (session.disposed) continue
        session.peer.emit(`doc/${event.kind}` as MainEvent, event)
      }
    }
  }

  /** Estado inicial del editor (lo que va en `init.documents`). */
  documentSeed(): DocumentEvent[] {
    const events: DocumentEvent[] = [...this.documents.values()].map((document) => ({
      kind: 'open',
      document
    }))
    events.push({
      kind: 'active',
      path: this.activeDocument,
      selection: this.activeSelection
    })
    return events
  }

  /**
   * Asegura un host para la extensión: lo lanza, negocia `init` y espera
   * `ready`. Idempotente: si ya hay uno sano, devuelve el mismo.
   */
  async ensureHost(request: HostActivationRequest): Promise<void> {
    const existing = this.sessions.get(request.extensionId)
    if (existing && !existing.disposed) {
      // El jail del fs y los permisos se evalúan por pedido, así que un
      // cambio de workspace abierto se refleja sin relanzar el proceso (el
      // `mode`, en cambio, se decide al arrancar: eso requiere reiniciar).
      existing.request.workspaceRoots = request.workspaceRoots
      existing.request.permissions = request.permissions
      await existing.ready
      return
    }

    const peer = new RpcPeer(
      { send: (message: HostMessage) => session.child.postMessage(message) },
      { idSign: 1, label: `main:${request.extensionId}` }
    )

    // `session.child` se asigna justo después; `peer.send` no lo toca hasta
    // que haya un mensaje que mandar (posterior a la asignación).
    // Storage, estado y datos del paquete ANTES de arrancar el proceso: son
    // cosas que VS Code también resuelve antes de `activate` (ver
    // `_loadExtensionContext`), y sin ellas una extensión real no arranca.
    const extras = await this.activationParams(request)

    const session: HostSession = {
      id: request.extensionId,
      peer,
      child: undefined as unknown as HostProcessLike,
      request,
      ready: Promise.resolve(),
      activated: false,
      views: new Map(),
      panels: new Map(),
      commands: new Set(),
      pendingCalls: new Set(),
      storagePaths: extras.storage,
      disposed: false
    }

    session.child = this.spawn(hostEntryPath())
    this.sessions.set(request.extensionId, session)
    this.installHandlers(session)

    const greeted = new Promise<void>((resolve, reject) => {
      const fail = (error: Error): void => {
        clearTimeout(timer)
        reject(error)
      }
      const timer = setTimeout(() => {
        session.failReady = undefined
        fail(new Error('el host no saludó en 10 s'))
      }, 10_000)
      session.failReady = fail
      peer.on('ready', () => {
        session.failReady = undefined
        clearTimeout(timer)
        resolve()
      })
    })

    session.ready = (async () => {
      await greeted
      const result = await peer.request<{ protocolVersion: number }>('init', {
        extensionId: request.extensionId,
        extensionPath: request.extensionPath,
        entry: request.entry,
        workspaceRoots: request.workspaceRoots,
        permissions: request.permissions,
        mode: request.mode,
        configurationDefaults: request.configurationDefaults ?? {},
        // Estado del editor al momento de arrancar: la extensión ve los
        // documentos abiertos desde `activate()`, no en el primer cambio.
        documents: this.documentSeed(),
        // Storage + estado + paquete: `context` del ExtensionContext listo.
        storage: extras.storage,
        globalState: extras.globalState,
        workspaceState: extras.workspaceState,
        configurationValues: extras.configurationValues,
        packageJSON: extras.packageJSON,
        esm: extras.esm,
        env: extras.env
      })
      if (result.protocolVersion !== HOST_PROTOCOL_VERSION) {
        throw new Error(
          `el host habla el protocolo ${result.protocolVersion} y el IDE espera ${HOST_PROTOCOL_VERSION}`
        )
      }
    })()

    await session.ready
  }

  /**
   * Corre `activate(context)` (una sola vez por host).
   *
   * **SIN timeout**: VS Code espera la promesa de `activate` y no la corta
   * (ningún tope en `extHostExtensionService.ts`). Un tope inventado convierte
   * una extensión grande y lenta (Cline tarda en cargar su bundle de 21 MB) en
   * un falso "falló". Lo que sí hay es un AVISO cada 15 s con lo que la
   * extensión está esperando: un cuelgue se diagnostica, no se adivina.
   */
  async activate(extensionId: string): Promise<string[]> {
    const session = this.requireSession(extensionId)
    if (session.activated) return []
    // Activación ÚNICA: dos `ensure` en paralelo (el botón de la activity bar y
    // el panel, por ejemplo) comparten la MISMA corrida en vez de disparar dos
    // `activate` sobre la extensión — que es lo que rompía a Cline ("Host
    // provider has already been initialized."). Si falla, se REUSA el mismo
    // error: reintentar dejaría a la extensión a medio inicializar y taparía
    // la causa real.
    session.activation ??= this.runActivation(session, extensionId)
    return await session.activation
  }

  /** Cuerpo de la activación (una corrida por host). */
  private async runActivation(session: HostSession, extensionId: string): Promise<string[]> {
    const startedAt = Date.now()

    const heartbeat = setInterval(() => {
      if (session.disposed || session.activated) return
      const pending = [...session.pendingCalls]
      const seconds = Math.round((Date.now() - startedAt) / 1000)
      // Se reporta como `warn` a propósito: es el único aviso que va a parar al
      // log en una app COMPILADA (el filtro de `log()` deja pasar warn/error),
      // y es justo cuando más se necesita — un `activate` que no termina es el
      // bug que se reportó como "se queda iniciando para siempre".
      this.log(
        'warn',
        `[${extensionId}] activate sigue en curso (${seconds}s)` +
          (pending.length > 0
            ? ` · esperando: ${pending.join(', ')}`
            : ' · sin llamadas pendientes (trabajo propio de la extensión)')
      )
      // Y a la UI: sin esto, un `activate` lento o colgado deja el panel en
      // "Iniciando…" sin decir nada (era el síntoma reportado con Cline: el
      // proceso vivía, pero el panel no daba ninguna pista). El panel lo
      // muestra mientras espera, así un cuelgue se ve y no se adivina.
      this.sink.onHostEvent(extensionId, 'activate/progress', { seconds, pending })
    }, 15_000)

    try {
      const result = await session.peer.request<{ commands: string[] }>('activate', undefined, 0)
      session.activated = true
      this.log(
        'info',
        `[${extensionId}] activate terminó en ${Date.now() - startedAt} ms (${result.commands?.length ?? 0} comandos)`
      )
      return result.commands ?? []
    } finally {
      clearInterval(heartbeat)
    }
  }

  /**
   * Comandos built-in que resuelve el propio host del IDE (sin UI de por medio).
   *
   * `setContext(key, value)`: guarda la clave y devuelve `true`. Se replica
   * porque es la PRIMERA llamada que await-ea una extensión al activar (Cline
   * lo hace 37 veces) y depende de que exista, no de la UI.
   */
  private runBuiltinCommand(session: HostSession, id: string, args: unknown[]): unknown {
    if (id === BUILTIN_COMMANDS.SET_CONTEXT) {
      const [key, value] = args as [string, unknown]
      if (typeof key === 'string') {
        const keys = this.contextKeys.get(session.id) ?? new Map<string, unknown>()
        keys.set(key, value)
        this.contextKeys.set(session.id, keys)
        // La UI también se entera: las claves `when` de menús salen de acá.
        this.sink.onHostEvent(session.id, 'context/key', { key, value })
      }
      return true
    }
    return undefined
  }

  /** Claves de contexto puestas por `setContext` (para la UI). */
  contextKeysOf(extensionId: string): Record<string, unknown> {
    return Object.fromEntries(this.contextKeys.get(extensionId) ?? [])
  }

  /** Deniega un rename/copy si origen o destino no están autorizados. */
  private denyMove(
    session: HostSession,
    from: string,
    to: string
  ): { success: false; error: string } | null {
    const source = this.authorize(session, 'read', from)
    if (!source.allowed) return { success: false, error: `origen: ${source.reason}` }
    const target = this.authorize(session, 'write', to)
    if (!target.allowed) return { success: false, error: `destino: ${target.reason}` }
    return null
  }

  /**
   * Marca/desmarca una llamada del host a la UI mientras está en vuelo.
   * La usan los handlers de abajo (notify, comandos, editor, fs).
   */
  private trackCall<T>(session: HostSession, label: string, run: () => Promise<T>): Promise<T> {
    session.pendingCalls.add(label)
    return run().finally(() => session.pendingCalls.delete(label))
  }

  /** Ejecuta un comando EN la extensión (el host local lo corre). */
  async executeCommand(extensionId: string, commandId: string, args: unknown[] = []): Promise<unknown> {
    const session = this.requireSession(extensionId)
    return await session.peer.request('command/execute', { id: commandId, args }, 60_000)
  }

  /**
   * Resuelve una vista y devuelve su TIPO (`webview` o `tree`): lo decide la
   * extensión (qué provider registró), no el manifest.
   */
  async resolveView(
    extensionId: string,
    viewId: string,
    title: string
  ): Promise<'webview' | 'tree'> {
    const session = this.requireSession(extensionId)
    const result = await session.peer.request<{ kind?: 'webview' | 'tree' }>('view/resolve', {
      viewId,
      title
    })
    return result?.kind === 'tree' ? 'tree' : 'webview'
  }

  /** Hijos de un nodo del árbol (`null` = raíz). */
  async treeChildren(
    extensionId: string,
    viewId: string,
    elementId: string | null
  ): Promise<TreeNodeModel[]> {
    const session = this.requireSession(extensionId)
    const result = await session.peer.request<{ nodes?: TreeNodeModel[] }>('tree/children', {
      viewId,
      elementId
    })
    return result?.nodes ?? []
  }

  /** Click en un nodo: la extensión corre el comando de ESE item. */
  async treeSelect(
    extensionId: string,
    viewId: string,
    elementId: string
  ): Promise<{ ran: boolean; command?: string }> {
    const session = this.requireSession(extensionId)
    return await session.peer.request('tree/select', { viewId, elementId }, 60_000)
  }

  /** Cierra la vista en la extensión (el panel se desmontó). */
  async disposeView(extensionId: string, viewId: string): Promise<void> {
    const session = this.sessions.get(extensionId)
    if (!session) return
    session.views.delete(viewId)
    try {
      await session.peer.request('view/dispose', { viewId })
    } catch {
      // El host pudo morir: la vista igual queda liberada de nuestro lado.
    }
  }

  /**
   * El usuario cerró la tab del panel → la extensión dispone su
   * `WebviewPanel` (su `onDidDispose` corre de verdad).
   */
  async disposePanel(extensionId: string, panelId: string): Promise<void> {
    const session = this.sessions.get(extensionId)
    if (!session) return
    session.panels.delete(panelId)
    try {
      await session.peer.request('panel/dispose', { panelId })
    } catch {
      // El host pudo morir: el panel igual queda liberado de nuestro lado.
    }
  }

  /** Mensaje del iframe hacia la extensión. */
  async receiveViewMessage(extensionId: string, viewId: string, message: unknown): Promise<void> {
    const session = this.requireSession(extensionId)
    await session.peer.request('view/receive', { viewId, message })
  }

  /** Apaga el host de una extensión (desinstalar / desactivar). */
  async shutdown(extensionId: string, reason = 'apagado a pedido'): Promise<void> {
    const session = this.sessions.get(extensionId)
    if (!session) return
    this.sessions.delete(extensionId)
    session.disposed = true
    try {
      await session.peer.request('deactivate', undefined, 3_000)
    } catch {
      // Aunque no conteste, lo matamos abajo.
    }
    session.peer.dispose(reason)
    try {
      session.child.kill()
    } catch {
      // Ya estaba muerto.
    }
  }

  async shutdownAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.shutdown(id, 'cerrando la app')))
  }

  // ── Interno ─────────────────────────────────────────────────────────────

  private requireSession(extensionId: string): HostSession {
    const session = this.sessions.get(extensionId)
    if (!session || session.disposed) {
      throw new Error(
        `no hay Extension Host para "${extensionId}"; hay que asegurarlo con ensureHost() antes`
      )
    }
    return session
  }

  private installHandlers(session: HostSession): void {
    const { peer } = session

    // Acá el mensaje llega directo (ver HostProcessLike).
    session.child.on('message', (message) => peer.receive(message as HostMessage))

    session.child.on('exit', (code) => {
      if (session.disposed) return
      session.disposed = true
      session.failReady?.(new Error('el host murió antes de saludar'))
      session.failReady = undefined
      this.sessions.delete(session.id)
      peer.dispose(`el host de "${session.id}" salió con código ${code}`)
      this.sink.onHostExit(session.id, code, 'el proceso de la extensión terminó')
    })

    // ── Eventos host → main ──────────────────────────────────────────────
    peer.on('log', (payload) => {
      const { level, message } = payload as LogPayload
      this.log(level, `[${session.id}] ${message}`)
      this.sink.onHostEvent(session.id, 'log', payload)
    })

    peer.on('command/registered', (payload) => {
      const { id, registered } = payload as CommandRegisteredPayload
      if (registered) session.commands.add(id)
      else session.commands.delete(id)
      this.sink.onHostEvent(session.id, 'command/registered', payload)
    })

    peer.on('view/html', (payload) => {
      const { viewId, html } = payload as ViewHtmlPayload
      const record = session.views.get(viewId) ?? { html: '', title: viewId }
      record.html = html
      session.views.set(viewId, record)
      this.sink.onHostEvent(session.id, 'view/html', { viewId, bytes: html.length })
    })

    peer.on('view/title', (payload) => {
      const { viewId, title } = payload as ViewTitlePayload
      const record = session.views.get(viewId) ?? { html: '', title }
      record.title = title
      session.views.set(viewId, record)
      this.sink.onHostEvent(session.id, 'view/title', payload)
    })

    peer.on('view/post', (payload) => {
      this.sink.onHostEvent(session.id, 'view/post', payload as ViewPostPayload)
    })

    // Árboles: la raíz va como snapshot y los refrescos como invalidación (el
    // renderer no guarda nodos viejos, vuelve a pedir los hijos).
    peer.on('view/tree', (payload) => {
      this.sink.onHostEvent(session.id, 'view/tree', payload)
    })

    peer.on('view/tree-change', (payload) => {
      this.sink.onHostEvent(session.id, 'view/tree-change', payload)
    })

    // ── Barra de estado y paneles del editor ─────────────────────────────
    // Los items y los paneles se emiten tal cual (son estado de la UI); el
    // HTML de un panel además se cachea acá, porque lo sirve `scrakk-ext:`.
    peer.on('status/item', (payload) => {
      this.sink.onHostEvent(session.id, 'status/item', payload)
    })

    // Diagnósticos: se empujan tal cual a la UI, que los lista en el panel de
    // Problemas. Son estado del host (no se cachean acá): el renderer guarda
    // la foto por archivo y la reemplaza en cada cambio.
    peer.on('diagnostics/change', (payload) => {
      this.sink.onHostEvent(session.id, 'diagnostics/change', payload)
    })

    // Decoraciones del editor (`editor.setDecorations`): mismo camino que los
    // diagnósticos — es estado del host y el renderer guarda la foto por
    // archivo, así que no se cachea acá.
    peer.on('decorations/set', (payload) => {
      this.sink.onHostEvent(session.id, 'decorations/set', payload)
    })

    peer.on('panel/open', (payload) => {
      const model = payload as { id?: string; title?: string }
      if (model.id && !session.panels.has(model.id)) {
        session.panels.set(model.id, { html: '', title: model.title ?? model.id })
      }
      this.sink.onHostEvent(session.id, 'panel/open', payload)
    })

    peer.on('panel/update', (payload) => {
      const update = payload as { id?: string; html?: string; title?: string }
      const record = update.id ? session.panels.get(update.id) : undefined
      if (record && typeof update.html === 'string') record.html = update.html
      if (record && update.title) record.title = update.title
      this.sink.onHostEvent(session.id, 'panel/update', payload)
    })

    peer.on('panel/close', (payload) => {
      const { id } = payload as { id?: string }
      if (id) session.panels.delete(id)
      this.sink.onHostEvent(session.id, 'panel/close', payload)
    })

    peer.on('fatal', (payload) => {
      const fatal = payload as FatalPayload
      this.log('error', `[${session.id}] error fatal: ${fatal.message}`)
      this.sink.onHostEvent(session.id, 'fatal', payload)
    })

    // ── Peticiones host → main (ids negativos) ───────────────────────────
    peer.handle('fs/read', async (raw) => {
      const { path } = raw as { path: string }
      const verdict = this.authorize(session, 'read', path)
      if (!verdict.allowed) return { success: false, error: verdict.reason } satisfies FsResultLike
      try {
        const content = await fs.readFile(path, 'utf-8')
        return { success: true, value: content } satisfies FsResultLike
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        } satisfies FsResultLike
      }
    })

    peer.handle('fs/write', async (raw) => {
      const { path, content } = raw as { path: string; content: string }
      const verdict = this.authorize(session, 'write', path)
      if (!verdict.allowed) return { success: false, error: verdict.reason } satisfies FsResultLike
      try {
        await fs.writeFile(path, content, 'utf-8')
        return { success: true } satisfies FsResultLike
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        } satisfies FsResultLike
      }
    })

    // ── `workspace.fs` completo (todo con el MISMO jail que fs/read) ──────
    // Implementar sólo read/write dejaba `stat()`, `createDirectory()` y
    // `readDirectory()` en “undefined is not a function” en medio del arranque
    // de una extensión real (Cline llama `.stat()` en su primera vuelta).
    peer.handle('fs/stat', async (raw): Promise<FsStatResult> => {
      const { path } = raw as { path: string }
      const verdict = this.authorize(session, 'read', path)
      if (!verdict.allowed) return { success: false, error: verdict.reason }
      try {
        const stats = await fs.stat(path)
        return { success: true, stat: toFileStat(stats) }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    peer.handle('fs/read-directory', async (raw): Promise<FsReadDirectoryResult> => {
      const { path } = raw as { path: string }
      const verdict = this.authorize(session, 'read', path)
      if (!verdict.allowed) return { success: false, error: verdict.reason }
      try {
        const entries = await fs.readdir(path, { withFileTypes: true })
        return {
          success: true,
          entries: entries.map((entry) => [entry.name, direntType(entry)] as [string, 0 | 1 | 2 | 64])
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    peer.handle('fs/create-directory', async (raw) => {
      const { path } = raw as { path: string }
      const verdict = this.authorize(session, 'write', path)
      if (!verdict.allowed) return { success: false, error: verdict.reason } satisfies FsResultLike<void>
      try {
        await fs.mkdir(path, { recursive: true })
        return { success: true } satisfies FsResultLike<void>
      } catch (error) {
        return { success: false, error: describe(error) } satisfies FsResultLike<void>
      }
    })

    peer.handle('fs/delete', async (raw) => {
      const { path, recursive } = raw as { path: string; recursive?: boolean }
      const verdict = this.authorize(session, 'write', path)
      if (!verdict.allowed) return { success: false, error: verdict.reason } satisfies FsResultLike<void>
      try {
        await fs.rm(path, { recursive: recursive ?? true, force: true })
        return { success: true } satisfies FsResultLike<void>
      } catch (error) {
        return { success: false, error: describe(error) } satisfies FsResultLike<void>
      }
    })

    // Rename/copy validan ORIGEN (lectura) y DESTINO (escritura) por separado:
    // si no, se podría sacar un archivo del workspace con un rename.
    peer.handle('fs/rename', async (raw) => {
      const { from, to, overwrite } = raw as { from: string; to: string; overwrite?: boolean }
      const denied = this.denyMove(session, from, to)
      if (denied) return denied
      try {
        if (overwrite) await fs.rm(to, { recursive: true, force: true })
        await fs.rename(from, to)
        return { success: true } satisfies FsResultLike<void>
      } catch (error) {
        return { success: false, error: describe(error) } satisfies FsResultLike<void>
      }
    })

    peer.handle('fs/copy', async (raw) => {
      const { from, to, overwrite } = raw as { from: string; to: string; overwrite?: boolean }
      const denied = this.denyMove(session, from, to)
      if (denied) return denied
      try {
        await fs.cp(from, to, { recursive: true, force: overwrite ?? true })
        return { success: true } satisfies FsResultLike<void>
      } catch (error) {
        return { success: false, error: describe(error) } satisfies FsResultLike<void>
      }
    })

    // ── Estado persistido, secretos y ajustes ─────────────────────────────
    peer.handle('state/write', async (raw) => {
      const { scope, key, value } = raw as { scope: MementoScope; key: string; value: unknown }
      await this.storage.writeState(
        session.id,
        scope,
        session.request.workspaceRoots[0] ?? null,
        key,
        value
      )
      return { ok: true }
    })

    peer.handle('secrets/get', async (raw) => {
      const { key } = raw as { key: string }
      const value = await this.storage.getSecret(session.id, key)
      return { success: true, value } satisfies FsResultLike<string>
    })

    peer.handle('secrets/store', async (raw) => {
      const { key, value } = raw as { key: string; value: string }
      await this.storage.storeSecret(session.id, key, value)
      return { success: true } satisfies FsResultLike<void>
    })

    peer.handle('secrets/delete', async (raw) => {
      const { key } = raw as { key: string }
      await this.storage.deleteSecret(session.id, key)
      return { success: true } satisfies FsResultLike<void>
    })

    peer.handle('configuration/write', async (raw) => {
      const { section, value, target } = raw as { section: string; value: unknown; target?: number }
      await this.storage.writeConfiguration(
        section,
        value,
        target,
        session.request.workspaceRoots[0] ?? null
      )
      return { success: true } satisfies FsResultLike<void>
    })

    // Búsqueda de archivos: la camina el MAIN (es el único con disco) y cada
    // ruta pasa por el MISMO jail que fs/read — no hay puerta trasera.
    peer.handle('workspace/find', async (raw) => {
      const { pattern, maxResults } = raw as { pattern?: string; maxResults?: number }
      return await this.findFiles(session, String(pattern ?? '**/*'), maxResults ?? 2000)
    })

    // Abrir un archivo en el editor es cosa de la UI (registry real de tabs).
    peer.handle('editor/open', async (raw) => {
      const { path } = raw as { path?: string }
      if (!path) return { success: false, error: 'editor/open sin path' }
      const verdict = this.authorize(session, 'read', path)
      if (!verdict.allowed) return { success: false, error: verdict.reason }
      const result = await this.trackCall(session, `abrir ${path} en el editor`, () =>
        this.renderer.invoke('editor/open', { path }, 15_000)
      )
      return (result ?? { success: true }) as { success: boolean; error?: string }
    })

    // Las notificaciones y los comandos viven en el renderer (registry real
    // del IDE): el main sólo hace de puente y devuelve la respuesta.
    peer.handle('notify', async (raw) => {
      const payload = raw as NotifyPayload
      const result = await this.trackCall(session, `notify("${payload.title}")`, () =>
        this.renderer.invoke('notify', payload, 10 * 60_000)
      )
      return (result ?? {}) as NotifyResult
    })

    peer.handle('command/execute', async (raw) => {
      const { id, args } = raw as { id: string; args: unknown[] }

      // 1) Built-in del IDE que se resuelve SIN depender de la UI. `setContext`
      //    cae acá: es la primera llamada que espera una extensión al activar y
      //    no puede quedar colgada por un round-trip.
      const builtin = this.runBuiltinCommand(session, id, args)
      if (builtin !== undefined) return builtin

      // 2) Comando de OTRA extensión: se rutea a su host, con los argumentos
      //    intactos. Solo si NADIE del lado de las extensiones lo tiene se le
      //    pregunta al IDE.
      const owner = this.hostOwningCommand(id, session.id)
      if (owner) return await owner.peer.request('command/execute', { id, args }, 60_000)
      return await this.trackCall(session, `comando del IDE "${id}"`, () =>
        this.renderer.invoke('command/execute', { id, args }, 60_000)
      )
    })

    // Abrir un link con el SO: cosa del main (Electron), no de la UI.
    peer.handle('host/open-external', async (raw) => {
      const { target } = raw as { target?: string }
      if (!target) return { success: false, error: 'openExternal sin target' }
      const { shell } = await import('electron')
      await shell.openExternal(target)
      return { success: true }
    })
  }

  /**
   * Camina el workspace buscando archivos que matcheen el glob.
   *
   * Devuelve rutas ABSOLUTAS ya autorizadas. `truncated` no es un detalle
   * decorativo: una extensión que pide todo el árbol en un repo grande tiene
   * que poder saber que la lista está cortada en vez de creer que eso es todo.
   */
  private async findFiles(
    session: HostSession,
    pattern: string,
    maxResults: number
  ): Promise<FindFilesResult> {
    const roots = session.request.workspaceRoots
    if (roots.length === 0) {
      return { paths: [], truncated: false, error: 'no hay workspace abierto' }
    }
    const limit = Math.max(1, Math.min(Number.isFinite(maxResults) ? maxResults : 2000, 20_000))
    const found: string[] = []
    let truncated = false

    for (const root of roots) {
      if (truncated) break
      const stack: string[] = [root]
      while (stack.length > 0) {
        const dir = stack.pop() as string
        let entries: Dirent[]
        try {
          entries = await fs.readdir(dir, { withFileTypes: true })
        } catch {
          continue
        }
        for (const entry of entries) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            if (SKIPPED_DIRS.has(entry.name)) continue
            if (this.authorize(session, 'read', full).allowed) stack.push(full)
            continue
          }
          if (!entry.isFile()) continue
          const relativePath = relative(root, full).split(sep).join('/')
          if (!matchesGlob(pattern, relativePath)) continue
          if (!this.authorize(session, 'read', full).allowed) continue
          found.push(full)
          if (found.length >= limit) {
            truncated = true
            break
          }
        }
      }
    }

    return { paths: found, truncated }
  }

  /**
   * Host que tiene registrado ese comando (excluyendo al que pregunta), o null.
   *
   * Es lo que permite que una extensión ejecute el comando de OTRA por id, que
   * es como se comunican las extensiones en VS Code.
   */
  private hostOwningCommand(commandId: string, exceptExtensionId: string): HostSession | null {
    for (const session of this.sessions.values()) {
      if (session.disposed || session.id === exceptExtensionId) continue
      if (session.commands.has(commandId)) return session
    }
    return null
  }

  /** Aplica el jail de permisos del IDE sobre una ruta pedida por la extensión. */
  private authorize(session: HostSession, mode: 'read' | 'write', targetPath: string) {
    return checkPathAccess(
      {
        declaredPermissions: session.request.permissions.length > 0 ? session.request.permissions : null,
        workspaceRoots: session.request.workspaceRoots,
        homeDir: this.homeDir,
        // Los directorios PROPIOS de la extensión son suyos (como en VS Code).
        allowedRoots: session.storagePaths
          ? [
              session.storagePaths.globalStorage,
              session.storagePaths.workspaceStorage,
              session.storagePaths.logs
            ]
          : undefined
      },
      mode,
      targetPath
    )
  }

  private log(level: LogPayload['level'], message: string): void {
    // En prod sólo warn/error para no inundar; en dev todo.
    if (level === 'warn' || level === 'error') console.warn(message)
    else if (process.env['NODE_ENV'] !== 'production') console.log(message)
  }
}
