// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Módulo compartido (main + preload + renderer) — contrato IPC del sistema LSP.
 *
 * Réplica 1:1 del comportamiento del LSP de scrakk-cli
 * (crates/codegen/st-scrakk-tools/src/implementations/lsp):
 *  - Un proceso hijo por servidor, singleton por nombre de servidor.
 *  - Arranque lazy al tocar un archivo; routing multi-servidor por extensión
 *    + root markers.
 *  - Sync de buffers full-text con versiones + didSave siempre.
 *  - Diagnósticos push (publishDiagnostics) con drain acotado que espera a
 *    TODOS los servers pendientes.
 *  - Config en `.scrakk/lsp.json` (proyecto) y `~/.scrakk/lsp.json` (usuario),
 *    mismo formato que detecta el CLI.
 */

export const LSP_IPC = {
  /** Setea el workspace root PRIMARIO (recrea el manager si cambió). */
  setWorkspace: 'lsp:set-workspace',
  /** Multi-root real: agrega/quita roots adicionales. */
  addWorkspaceRoot: 'lsp:add-workspace-root',
  removeWorkspaceRoot: 'lsp:remove-workspace-root',
  listWorkspaceRoots: 'lsp:list-workspace-roots',
  /** Estado de todos los servers conocidos. */
  status: 'lsp:status',
  /** Request LSP crudo o tipado sobre los servers de un archivo. */
  request: 'lsp:request',
  /** didOpen/didChange/didSave desde el host (editor/tools). */
  notifyFileChanged: 'lsp:notify-file-changed',
  /** Cierra el documento (didClose) en los servers que lo tengan abierto. */
  notifyFileClosed: 'lsp:notify-file-closed',
  /** Espera (acotado) a que todos los servers pendientes reporten y agrega. */
  drainDiagnostics: 'lsp:drain-diagnostics',
  /** Diagnósticos ERROR/WARNING para rutas específicas (abre si hace falta). */
  readDiagnostics: 'lsp:read-diagnostics',
  /** Apaga todos los servers ordenadamente. */
  shutdownAll: 'lsp:shutdown-all',
  /** Reinicia UN server (shutdown + start). */
  restartServer: 'lsp:restart-server',
  /** Fuerza instalación de la receta de un builtin (si tiene). */
  installServer: 'lsp:install-server',
  /**
   * Tipo de extensión 'lspServers': registra/quit servers aportados por una
   * extensión (.sef o builtin). Prioridad: user > project > dynamic > builtin.
   */
  registerDynamicServers: 'lsp:register-dynamic-servers',
  removeDynamicServers: 'lsp:remove-dynamic-servers',
  /**
   * Servers que el usuario APAGÓ (por id). Un server apagado no arranca ni
   * recibe documentos: es la única forma de que "no quiero este linter aquí"
   * sea una decisión real y no un adorno de Ajustes.
   */
  setDisabledServers: 'lsp:set-disabled-servers',
  getDisabledServers: 'lsp:get-disabled-servers',
  /** Evento main → renderer: publishDiagnostics de cualquier server. */
  onDiagnostics: 'lsp:on-diagnostics',
  /** Evento main → renderer: cambios de estado de servers. */
  onServerEvent: 'lsp:on-server-event',
  /** Evento main → renderer: progreso $/progress (begin/report/end). */
  onProgress: 'lsp:on-progress'
} as const

// ── Config (mismo shape que .scrakk/lsp.json del CLI) ──────────────────────

export type LspTransport = 'stdio' | 'socket'

/**
 * Config de un server — idéntica a `LspServerConfig` del CLI (config.rs).
 * Acepta aliases camelCase como el original.
 */
export interface LspServerConfig {
  /** Binario a spawnear, u host:port si transport = socket. */
  command: string
  args?: string[]
  transport?: LspTransport
  env?: Record<string, string>
  /** Extensión (con punto) → language id LSP. Ej: { ".ts": "typescript" }. */
  extensions?: Record<string, string>
  initializationOptions?: unknown
  /** Settings enviados vía workspace/didChangeConfiguration tras inicializar. */
  settings?: unknown
  /** Root alternativo para este server (default: workspace root). */
  workspaceFolder?: string
  startupTimeout?: number
  shutdownTimeout?: number
  restartOnCrash?: boolean
  maxRestarts?: number
}

export const DEFAULT_STARTUP_TIMEOUT_MS = 15_000
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
export const DEFAULT_DRAIN_TIMEOUT_MS = 500
export const DEFAULT_MAX_RESTARTS = 3

export function startupTimeoutMs(config: LspServerConfig): number {
  return config.startupTimeout ?? DEFAULT_STARTUP_TIMEOUT_MS
}

export function shutdownTimeoutMs(config: LspServerConfig): number {
  return config.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT_MS
}

export function restartOnCrash(config: LspServerConfig): boolean {
  return config.restartOnCrash ?? false
}

export function maxRestarts(config: LspServerConfig): number {
  return config.maxRestarts ?? DEFAULT_MAX_RESTARTS
}

// ── Diagnósticos ───────────────────────────────────────────────────────────

export interface LspRange {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

/** Diagnostic tal como lo publica un language server (posiciones 0-based). */
export interface LspDiagnostic {
  range: LspRange
  severity?: number // 1=Error 2=Warning 3=Information 4=Hint
  message: string
  source?: string
  code?: string | number
}

/** Diagnósticos de UN archivo agregados de todos los servers. */
export interface FileDiagnostics {
  path: string
  diagnostics: LspDiagnostic[]
}

// ── Estado de servers ──────────────────────────────────────────────────────

export type LspServerStateKind = 'starting' | 'ready' | 'crashed' | 'retrying' | 'failed' | 'stopped'

export interface LspServerStatus {
  id: string
  name: string
  root: string
  state: LspServerStateKind
  /** true si el binario fue encontrado en el sistema (o es socket). */
  available: boolean
  /**
   * Origen de la config: builtin | user | project | dynamic.
   * `dynamic` = lo aportó una extensión (tipo `lspServers` o `vscode-languageclient`).
   */
  source: 'builtin' | 'user' | 'project' | 'dynamic'
  extensions: string[]
  /**
   * Extensión que lo aportó (sólo `source: 'dynamic'`): el id de la fuente con
   * la que se registró, para poder apagarlo desde Ajustes sabiendo de quién es.
   */
  extensionId?: string
  /** El usuario lo apagó: no arranca (y se ve como tal, no como "detenido"). */
  disabled?: boolean
  error?: string
}

export interface LspServerEventPayload {
  serverName: string
  state: LspServerStateKind
  error?: string
  attempt?: number
}

export interface DiagnosticsChangedPayload {
  serverName: string
  path: string
  diagnostics: LspDiagnostic[]
}

// ── Requests ───────────────────────────────────────────────────────────────

export interface SetWorkspaceRequest {
  rootPath: string
}

export interface SetWorkspaceResponse {
  ok: boolean
  servers: string[]
  error?: string
}

/**
 * Request genérico: se enruta a los servers que atienden `filePath`
 * (workspaceSymbol va a todos). Réplica del dispatch del CLI.
 */
export interface LspRequestPayload {
  method: string
  params?: unknown
  /** Archivo que determina a qué servers enviar. Obligatorio salvo métodos globales. */
  filePath?: string
  /** Forzar envío a TODOS los servers corriendo (workspaceSymbol). */
  broadcast?: boolean
  /** Enviar SOLO a este server (p. ej. completionItem/resolve del server que respondió). */
  serverName?: string
  timeoutMs?: number
}

export interface LspRequestResponse {
  ok: boolean
  /** Una entrada por server que respondió. */
  results: Array<{ serverName: string; result?: unknown; error?: string }>
  error?: string
}

export interface NotifyFileChangedRequest {
  path: string
  content: string
}

// ── Multi-root ─────────────────────────────────────────────────────────────

export interface WorkspaceRootRequest {
  rootPath: string
}

export interface ListWorkspaceRootsResponse {
  roots: string[]
}

// ── Servers dinámicos (tipo de extensión 'lspServers') ────────────────────

/** Definición declarativa que aporta una extensión — mismo shape que builtin. */
export interface DynamicLspServerDef {
  id: string
  command: string
  args?: string[]
  extensions: Record<string, string>
  rootMarkers?: string[]
  gatedBy?: string
  install?: {
    kind: 'npm' | 'go' | 'gem' | 'dotnet' | 'github' | 'custom'
    package?: string
    repo?: string
    assetPattern?: string
    binaryPath?: string
    cmd?: string[]
  }
  initializationOptions?: unknown
  settings?: unknown
}

export interface RegisterDynamicServersRequest {
  sourceId: string
  servers: DynamicLspServerDef[]
}

export interface RemoveDynamicServersRequest {
  sourceId: string
}

export interface RegisterDynamicServersResponse {
  ok: boolean
  registered: string[]
  error?: string
}

// ── Servers apagados por el usuario ───────────────────────────────────────

export interface SetDisabledServersRequest {
  ids: string[]
}

export interface DisabledServersResponse {
  ids: string[]
}

// ── Progreso $/progress ────────────────────────────────────────────────────

export interface LspProgressPayload {
  serverName: string
  token: string
  /** begin → report* → end. */
  phase: 'begin' | 'report' | 'end'
  title?: string
  message?: string
  percentage?: number
}

export interface DrainDiagnosticsRequest {
  timeoutMs?: number
}

export interface ReadDiagnosticsRequest {
  paths: string[]
}

// ── Acciones por server ───────────────────────────────────────────────────

export interface LspServerActionRequest {
  serverName: string
}

export interface LspServerActionResult {
  ok: boolean
  error?: string
}

// ── API expuesta por el preload (window.api.lsp) ───────────────────────────

export interface LspApi {
  setWorkspace(rootPath: string): Promise<SetWorkspaceResponse>
  addWorkspaceRoot(rootPath: string): Promise<SetWorkspaceResponse>
  removeWorkspaceRoot(rootPath: string): Promise<ListWorkspaceRootsResponse>
  listWorkspaceRoots(): Promise<ListWorkspaceRootsResponse>
  status(): Promise<LspServerStatus[]>
  request(payload: LspRequestPayload): Promise<LspRequestResponse>
  notifyFileChanged(path: string, content: string): Promise<{ ok: boolean }>
  notifyFileClosed(path: string): Promise<{ ok: boolean }>
  drainDiagnostics(timeoutMs?: number): Promise<FileDiagnostics[]>
  readDiagnostics(paths: string[]): Promise<FileDiagnostics[]>
  shutdownAll(): Promise<{ ok: boolean }>
  restartServer(serverName: string): Promise<LspServerActionResult>
  /** Instala la receta del server si no está en el sistema. */
  installServer(serverName: string): Promise<LspServerActionResult>
  /** Tipo de extensión 'lspServers': registra servers dinámicos. */
  registerDynamicServers(sourceId: string, servers: DynamicLspServerDef[]): Promise<RegisterDynamicServersResponse>
  removeDynamicServers(sourceId: string): Promise<{ ok: boolean }>
  /** Apaga/enciende servers por id (la decisión vive en Ajustes). */
  setDisabledServers(ids: string[]): Promise<{ ok: boolean }>
  /** Los ids apagados que el main tiene aplicados ahora mismo. */
  getDisabledServers(): Promise<DisabledServersResponse>
  /** Suscripción a publishDiagnostics (live). Devuelve unsubscriber. */
  onDiagnostics(callback: (payload: DiagnosticsChangedPayload) => void): () => void
  /** Suscripción a cambios de estado de servers. Devuelve unsubscriber. */
  onServerEvent(callback: (payload: LspServerEventPayload) => void): () => void
  /** Suscripción a progreso $/progress. Devuelve unsubscriber. */
  onProgress(callback: (payload: LspProgressPayload) => void): () => void
}

// ── Parser de config de server (compartido main/renderer) ──────────────────

/** Parsea y valida UNA entrada de lsp.json. null = inválida (se descarta). */
export function parseLspServerConfig(raw: unknown, serverName: string): LspServerConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    console.warn(`[lsp] config inválida para "${serverName}"`)
    return null
  }
  const r = raw as Record<string, unknown>

  if (typeof r.command !== 'string' || r.command.length === 0) {
    console.warn(`[lsp] "${serverName}" sin "command" válido`)
    return null
  }

  const transport: LspTransport = r.transport === 'socket' ? 'socket' : 'stdio'

  return {
    command: r.command,
    args: toStringArray(r.args),
    transport,
    env: toStringRecord(r.env),
    extensions: parseExtensions(
      r.extensions ?? (r as Record<string, unknown>).extensionToLanguage ?? undefined,
      serverName
    ),
    initializationOptions: r.initializationOptions ?? undefined,
    settings: r.settings ?? undefined,
    workspaceFolder: typeof r.workspaceFolder === 'string' ? r.workspaceFolder : undefined,
    startupTimeout: toPositiveInt(r.startupTimeout),
    shutdownTimeout: toPositiveInt(r.shutdownTimeout),
    restartOnCrash: typeof r.restartOnCrash === 'boolean' ? r.restartOnCrash : undefined,
    maxRestarts: toPositiveInt(r.maxRestarts)
  }
}

function parseExtensions(raw: unknown, serverName: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [ext, langId] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof langId !== 'string') continue
    let normalized = ext.trim().toLowerCase()
    if (!normalized.startsWith('.')) normalized = `.${normalized}`
    out[normalized] = langId
  }
  if (Object.keys(out).length === 0) {
    console.warn(`[lsp] "${serverName}" sin extensiones declaradas; nunca routeará archivos`)
  }
  return out
}

function toStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const arr = raw.filter((v): v is string => typeof v === 'string')
  return arr.length > 0 ? arr : undefined
}

function toStringRecord(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function toPositiveInt(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined
  return Math.floor(raw)
}
