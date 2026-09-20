/**
 * LSP — manager de múltiples servidores, MULTI-ROOT REAL.
 *
 * Réplica de manager.rs del CLI extendida a N roots:
 *  - Cada root carga sus capas: user (global) > project (<root>/.scrakk) >
 *    dynamic (tipo de extensión 'lspServers') > builtins descubiertos ahí.
 *  - Routing: un archivo pertenece al root MÁS PROFUNDO que lo contiene;
 *    los servers corren como instancias `name@root` (singleton por par).
 *  - Arranque lazy por archivo, diagnósticos pendientes por (cliente,
 *    lifecycle), drain que espera a TODOS, readDiagnostics con settle.
 *  - Restart-on-crash con backoff 1s→30s y presupuesto de vida, con replay
 *    real de documentos desde disco.
 *  - Requests: por archivo / broadcast / dirigidos a UN server.
 */

import * as fs from 'fs/promises'
import { accessSync } from 'node:fs'
import * as path from 'path'
import type {
  FileDiagnostics,
  LspDiagnostic,
  LspProgressPayload,
  LspRequestPayload,
  LspRequestResponse,
  LspServerConfig,
  LspServerEventPayload,
  LspServerStatus,
  DynamicLspServerDef
} from '@shared/lsp'
import { DEFAULT_DRAIN_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS } from '@shared/lsp'
import { LspClient } from './client'
import {
  BUILTIN_SERVERS,
  discoverBuiltinServers,
  builtinAvailability,
  commandResolves
} from './builtinServers'
import { downloadsDisabled, install, resolveManagedCommand, managedNpmDir, type InstallRecipe } from './install'
import { loadConfiguredServers } from './config'
import { resolveServers } from './routing'

const INSTALL_TIMEOUT_MS = 300_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)
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

/** Tipo de receta expuesto para tests. */
export type { InstallRecipe }

/** Definición builtin/dinámica → config parseada (para registro dinámico). */
function defToConfig(def: DynamicLspServerDef): LspServerConfig | null {
  return (
    def.command && def.command.length > 0
      ? {
          command: def.command,
          args: def.args,
          extensions: normalizeExtensions(def.extensions),
          initializationOptions: def.initializationOptions,
          settings: def.settings
        }
      : null
  )
}

function normalizeExtensions(raw: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw) return out
  for (const [ext, langId] of Object.entries(raw)) {
    let normalized = ext.trim().toLowerCase()
    if (!normalized.startsWith('.')) normalized = `.${normalized}`
    out[normalized] = langId
  }
  return out
}

/**
 * Scan acotado del workspace para extensiones conocidas (réplica de
 * scan_workspace_extensions: presupuesto 8000 entradas; null = excedido).
 */
export async function scanWorkspaceExtensions(root: string): Promise<Set<string> | null> {
  const BUDGET = 8_000
  const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'target', '__pycache__', '.venv'])
  const found = new Set<string>()
  let seen = 0

  const queue: string[] = [root]
  while (queue.length > 0) {
    const dir = queue.shift()!
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      seen++
      if (seen > BUDGET) return null
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) queue.push(full)
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      if (ext) found.add(ext)
    }
  }
  return found
}

interface PendingState {
  lifecycleId: number
  uris: Set<string>
}

export class LspManager {
  /** Roots registrados, en orden (el primero es el primario). */
  private roots: string[] = []
  /** Configs fusionados POR ROOT (user+project+dynamic+builtin de ese root). */
  private serversByRoot = new Map<string, Record<string, LspServerConfig>>()
  private sourcesByRoot = new Map<string, Record<string, 'user' | 'project' | 'builtin' | 'dynamic'>>()
  /** Clientes vivos, key = `name@root`. */
  private clients = new Map<string, LspClient>()
  private pendingByClient = new Map<string, PendingState>()
  private nextLifecycleId = 1
  private shuttingDown = false

  /** Servers dinámicos aportados por extensiones (sourceId → defs). */
  private dynamicDefs = new Map<string, DynamicLspServerDef[]>()

  /** Documentos abiertos por cliente (absPath → languageId) para el replay. */
  private openDocs = new Map<string, Map<string, string>>()
  private availabilityByRoot = new Map<string, Record<string, boolean>>()
  /** Último error por client-key: visible en status() aunque no haya cliente. */
  private lastErrorByKey = new Map<string, string>()

  private drainWaiters = new Set<() => void>()
  private restartBudget = new Map<string, number>()
  private monitored = new Set<string>()
  private restarting = new Set<string>()
  /** Circuit breaker: keys con ≥3 muertes súbitas seguidas. */
  private autoStartBlocked = new Set<string>()
  private suddenDeaths = new Map<string, number>()

  private emitEvent: (payload: LspServerEventPayload) => void
  private emitDiagnostics: (payload: import('@shared/lsp').DiagnosticsChangedPayload) => void
  private emitProgress?: (payload: LspProgressPayload) => void

  constructor(
    emitEvent: (payload: LspServerEventPayload) => void,
    emitDiagnostics: (payload: import('@shared/lsp').DiagnosticsChangedPayload) => void,
    emitProgress?: (payload: LspProgressPayload) => void
  ) {
    this.emitEvent = emitEvent
    this.emitDiagnostics = emitDiagnostics
    this.emitProgress = emitProgress
  }

  getPrimaryRoot(): string {
    return this.roots[0] ?? ''
  }

  listRoots(): string[] {
    return [...this.roots]
  }

  // ── Roots ─────────────────────────────────────────────────────────────────

  /** Primario: resetea todos los roots a uno solo. Devuelve servers del root. */
  async setWorkspace(rootPath: string): Promise<string[]> {
    await this.shutdownAll()
    this.roots = []
    await this.addWorkspaceRootInternal(rootPath)
    return Object.keys(this.serversByRoot.get(rootPath) ?? {}).sort()
  }

  async addWorkspaceRoot(rootPath: string): Promise<string[]> {
    const absolute = path.resolve(rootPath)
    if (!this.roots.includes(absolute)) {
      await this.addWorkspaceRootInternal(absolute)
    }
    return Object.keys(this.serversByRoot.get(absolute) ?? {}).sort()
  }

  private async addWorkspaceRootInternal(rootPath: string): Promise<void> {
    const absolute = path.resolve(rootPath)
    if (!this.roots.includes(absolute)) {
      this.roots.push(absolute)
      await this.loadRoot(absolute)
    }
  }

  async removeWorkspaceRoot(rootPath: string): Promise<string[]> {
    const absolute = path.resolve(rootPath)
    this.roots = this.roots.filter((r) => r !== absolute)

    // Apagar clientes de ese root.
    for (const [key, client] of [...this.clients]) {
      if (key.endsWith(`@${absolute}`)) {
        this.clients.delete(key)
        this.pendingByClient.delete(key)
        // Purgar TODO el estado por cliente: si no, cada add/remove de root
        // deja entradas huérfanas (textos + budgets) que crecen sin cota.
        this.openDocs.delete(key)
        this.restartBudget.delete(key)
        this.monitored.delete(key)
        this.autoStartBlocked.delete(key)
        this.suddenDeaths.delete(key)
        await client.shutdown()
      }
    }
    this.serversByRoot.delete(absolute)
    this.sourcesByRoot.delete(absolute)
    this.availabilityByRoot.delete(absolute)
    this.extensionsScans.delete(absolute)
    return [...this.roots]
  }

  /** Carga configs de un root: user+project → dynamic → builtins (huecos). */
  private async loadRoot(root: string): Promise<void> {
    const { configs, sources } = await loadConfiguredServers(root)
    const merged: Record<string, LspServerConfig> = { ...configs }
    const mergedSources: Record<string, 'user' | 'project' | 'builtin' | 'dynamic'> = {
      ...Object.fromEntries(Object.keys(configs).map((k) => [k, sources[k]]))
    }

    // Dinámicos (extensiones): pisan builtin, no pisan user/project.
    for (const def of this.allDynamicDefs()) {
      if (merged[def.id]) continue
      if (def.gatedBy && !(await projectDeclaresDependency(root, def.gatedBy))) continue
      const config = defToConfig(def)
      if (config) {
        merged[def.id] = config
        mergedSources[def.id] = 'dynamic'
      }
    }

    const builtins = await discoverBuiltinServers(root)
    for (const [name, config] of Object.entries(builtins)) {
      if (!merged[name]) {
        merged[name] = config
        mergedSources[name] = 'builtin'
      }
    }

    // Un server APAGADO por el usuario sigue en el mapa (así Ajustes lo lista
    // y se puede volver a encender), pero `startClient` se niega a levantarlo:
    // el gate vive ahí, que es el único camino por el que un server arranca.

    // Disponibilidad real de binarios para status()/botón Instalar.
    const availability = await builtinAvailability(root, Object.keys(merged))
    this.availabilityByRoot.set(root, availability)

    this.serversByRoot.set(root, merged)
    this.sourcesByRoot.set(root, mergedSources)
  }

  private allDynamicDefs(): DynamicLspServerDef[] {
    return [...this.dynamicDefs.values()].flat()
  }

  /**
   * Tipo de extensión 'lspServers': registra defs dinámicas e invalida las
   * cargas por root (los nuevos servers arrancan lazy en el próximo uso).
   * Merge por id: varias llamadas con el mismo sourceId acumulan.
   */
  registerDynamicServers(sourceId: string, servers: DynamicLspServerDef[]): string[] {
    const existing = this.dynamicDefs.get(sourceId) ?? []
    const merged = [
      ...existing.filter((e) => !servers.some((s) => s.id === e.id)),
      ...servers
    ]
    this.dynamicDefs.set(sourceId, merged)
    return this.invalidateAllRoots()
  }

  async removeDynamicServers(sourceId: string): Promise<string[]> {
    const removedIds = new Set((this.dynamicDefs.get(sourceId) ?? []).map((d) => d.id))
    this.dynamicDefs.delete(sourceId)

    // Apagar clientes corriendo cuyo server SOLO existía como dinámico
    // (si user/project lo definen, sigue siendo válido sin la extensión).
    for (const [key, client] of [...this.clients.entries()]) {
      const atIdx = key.lastIndexOf('@')
      const name = key.slice(0, atIdx)
      const root = key.slice(atIdx + 1)
      const stillDefined =
        this.sourcesByRoot.get(root)?.[name] === 'user' ||
        this.sourcesByRoot.get(root)?.[name] === 'project'
      if (removedIds.has(name) && !stillDefined) {
        this.clients.delete(key)
        this.pendingByClient.delete(key)
        await client.shutdown()
      }
    }

    await this.invalidateAllRootsAsync()
    return [...removedIds]
  }

  /**
   * Servers apagados por el usuario (ids).
   *
   * Vive en el manager (y no sólo en Ajustes) porque la decisión tiene que
   * aplicarse ANTES de arrancar nada: un server apagado no debe ofrecerse para
   * un archivo, ni quedar "disponible" en `status()`, ni consumir su binario.
   */
  private disabledServers = new Set<string>()

  /** Ids apagados ahora mismo (la UI los lee para pintar el estado real). */
  disabledServerIds(): string[] {
    return [...this.disabledServers].sort()
  }

  /** Extensión que aportó ese server dinámico (`undefined` si no es dinámico). */
  private dynamicOwnerOf(id: string): string | undefined {
    for (const [sourceId, defs] of this.dynamicDefs) {
      if (defs.some((def) => def.id === id)) return sourceId
    }
    return undefined
  }

  /**
   * Aplica la lista de servers apagados y recarga los roots.
   *
   * Un server que se APAGA y estaba corriendo se apaga de verdad (no se deja
   * vivo "hasta que se reinicie"): seguir recibiendo diagnósticos de un server
   * apagado sería justo lo contrario de lo que pidió el usuario.
   */
  async setDisabledServers(ids: string[]): Promise<void> {
    const previous = this.disabledServers
    const next = new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))
    const turnedOff = [...next].filter((id) => !previous.has(id))
    const turnedOn = [...previous].filter((id) => !next.has(id))
    this.disabledServers = next

    for (const id of turnedOff) {
      for (const [key, client] of [...this.clients.entries()]) {
        if (key.slice(0, key.lastIndexOf('@')) !== id) continue
        this.clients.delete(key)
        this.pendingByClient.delete(key)
        this.openDocs.delete(key)
        this.autoStartBlocked.delete(key)
        await client.shutdown()
      }
    }

    // Reencender limpia el bloqueo por crashes: si no, el server volvería con
    // el estado 'failed' pegado y no arrancaría igual (un toggle que no hace
    // nada es peor que no tenerlo).
    const turnedOnSet = new Set(turnedOn)
    for (const key of [...this.autoStartBlocked]) {
      if (!turnedOnSet.has(key.slice(0, key.lastIndexOf('@')))) continue
      this.autoStartBlocked.delete(key)
      this.suddenDeaths.delete(key)
      this.lastErrorByKey.delete(key)
    }

    await this.invalidateAllRootsAsync()
  }

  /** Recarga TODOS los roots (awaitable para tests/determinismo). */
  private async invalidateAllRootsAsync(): Promise<void> {
    for (const root of [...this.roots]) {
      await this.loadRoot(root)
    }
  }

  /** Recarga configs por root sin tocar clientes corriendo. */
  private invalidateAllRoots(): string[] {
    void this.invalidateAllRootsAsync()
    return [...this.allDynamicDefs().map((d) => d.id)]
  }

  /**
   * Root propietario de un archivo: el más profundo que lo contenga
   * (prefijo de ruta); fallback al primario.
   */
  private owningRoot(filePath: string): string {
    const absolute = path.resolve(filePath).replace(/\\/g, '/')
    let best: string | null = null
    for (const root of this.roots) {
      const normalized = root.replace(/\\/g, '/')
      if (absolute === normalized || absolute.startsWith(normalized.endsWith('/') ? normalized : normalized + '/')) {
        if (!best || normalized.length > best.length) best = root
      }
    }
    return best ?? this.roots[0] ?? ''
  }

  // ── Ciclo de vida de clientes ────────────────────────────────────────────

  private clientKey(serverName: string, root: string): string {
    return `${serverName}@${root}`
  }

  private async startClient(serverName: string, root: string, opts: { manual?: boolean } = {}): Promise<boolean> {
    const key = this.clientKey(serverName, root)
    if (this.clients.has(key) || this.shuttingDown) return true
    // Apagado por el usuario: NI el arranque automático ni un reinicio a mano
    // lo levantan. Encenderlo es una decisión explícita (Ajustes → Servidores).
    if (this.disabledServers.has(serverName)) return false
    if (this.autoStartBlocked.has(key) && !opts.manual) {
      return false
    }
    const config = this.serversByRoot.get(root)?.[serverName]
    if (!config) return false

    const resolved = await this.resolveOrInstall(serverName, config, root)
    if (!resolved) {
      const error =
        config.transport === 'socket' ? undefined : `binario no encontrado: ${config.command}`
      if (error) this.lastErrorByKey.set(key, error)
      this.emitEvent({ serverName, state: 'failed', error })
      return false
    }
    this.lastErrorByKey.delete(key)
    ;(this.serversByRoot.get(root) ?? {})[serverName] = resolved

    const lifecycleId = this.nextLifecycleId++
    this.emitEvent({ serverName, state: 'starting' })

    // Server instalado en nuestro dir gestionado de npm: inyectar dónde vive
    // el SDK de TypeScript (tsserver), que el server NO encuentra solo porque
    // busca desde el workspace del usuario.
    const augmented = this.augmentManagedTypeScript(resolved)

    const client = new LspClient(serverName, lifecycleId, augmented, root, {
      onDiagnostics: (payload) => {
        this.notifyDiagnosticsArrived()
        this.emitDiagnostics(payload)
      },
      onState: (state, error) => {
        this.emitEvent({ serverName, state, error })
      },
      onProcessExit: (_code, stderrTail) => void this.handleCrash(serverName, root, stderrTail),
      onProgress: (payload) => this.emitProgress?.(payload)
    })

    try {
      await client.start()
      this.clients.set(key, client)
      this.lastErrorByKey.delete(key)
      this.armRestartMonitor(serverName, key)
      return true
    } catch (error) {
      this.emitEvent({
        serverName,
        state: 'failed',
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * Réplica de manager.rs::resolve_or_install con dirs gestionados y receta.
   */
  private async resolveOrInstall(
    serverName: string,
    config: LspServerConfig,
    root: string
  ): Promise<LspServerConfig | null> {
    if (config.transport === 'socket') return config
    if (await commandResolves(config.command)) return config

    const managed = await resolveManagedCommand(config.command)
    if (managed) return { ...config, command: managed }

    const def =
      BUILTIN_SERVERS.find((candidate) => candidate.id === serverName) ??
      this.allDynamicDefs().find((candidate) => candidate.id === serverName)
    const recipe = def?.install
    if (!recipe || downloadsDisabled()) return null

    if (!(await this.workspaceMatchesExtensions(root, config.extensions))) {
      return null
    }

    try {
      return await withTimeout(install(recipe as InstallRecipe, config), INSTALL_TIMEOUT_MS)
    } catch (error) {
      console.warn(`[lsp] auto-instalación de "${serverName}" falló:`, error)
      return null
    }
  }

  private extensionsScans = new Map<string, Set<string> | null>()

  private async workspaceMatchesExtensions(
    root: string,
    extensions: Record<string, string> | undefined
  ): Promise<boolean> {
    if (!extensions || Object.keys(extensions).length === 0) return true
    if (!this.extensionsScans.has(root)) {
      this.extensionsScans.set(root, await scanWorkspaceExtensions(root))
    }
    const found = this.extensionsScans.get(root)
    if (!found) return true
    return Object.keys(extensions).some((ext) => found.has(ext))
  }

  /** Lazy: arranca el server si no corre. Devuelve si hay cliente disponible. */
  async ensureServerReady(serverName: string): Promise<boolean> {
    const existing = [...this.clients.entries()].find(([key]) =>
      key.startsWith(`${serverName}@`)
    )
    if (existing) return true
    if (this.shuttingDown || this.restarting.has(serverName)) return false
    const root = this.roots.find((r) => this.serversByRoot.get(r)?.[serverName])
    if (!root) return false
    return this.startClient(serverName, root)
  }

  /** Routing multi-server para un archivo (en su root propietario). */
  async ensureServersForFile(
    filePath: string
  ): Promise<Array<{ serverName: string; languageId: string; root: string }>> {
    const root = this.owningRoot(filePath)
    if (!root) return []
    const servers = this.serversByRoot.get(root) ?? {}
    const matches = await resolveServers(servers, root, filePath, (name) =>
      dynamicRootMarkers(name)
    )
    const ready: Array<{ serverName: string; languageId: string; root: string }> = []
    for (const match of matches) {
      if (await this.startClient(match.serverName, root)) {
        ready.push({ ...match, root })
      }
    }
    return ready
  }

  /** Abre el archivo en cada server que lo atiende y devuelve los clientes. */
  async ensureFileOpen(filePath: string): Promise<LspClient[]> {
    const matches = await this.ensureServersForFile(filePath)
    const opened: LspClient[] = []
    for (const { serverName, languageId, root } of matches) {
      const client = this.clients.get(this.clientKey(serverName, root))
      if (!client) continue
      if (!client.hasDocument(filePath)) {
        await client.ensureFileOpen(filePath, languageId)
      }
      this.trackDoc(this.clientKey(serverName, root), filePath, languageId)
      opened.push(client)
    }
    return opened
  }

  private trackDoc(clientKey: string, filePath: string, languageId: string): void {
    let docs = this.openDocs.get(clientKey)
    if (!docs) {
      docs = new Map()
      this.openDocs.set(clientKey, docs)
    }
    docs.set(path.resolve(filePath), languageId)
  }

  private untrackDocEverywhere(filePath: string): void {
    const absolute = path.resolve(filePath)
    for (const docs of this.openDocs.values()) {
      docs.delete(absolute)
    }
  }

  // ── Sync desde el host ────────────────────────────────────────────────────

  async notifyFileChanged(filePath: string, content: string): Promise<void> {
    const matches = await this.ensureServersForFile(filePath)
    for (const { serverName, languageId, root } of matches) {
      const key = this.clientKey(serverName, root)
      const client = this.clients.get(key)
      if (!client) continue
      await client.notifyFileChange(filePath, content, languageId)
      this.trackDoc(key, filePath, languageId)
      this.markPending(key, client.lifecycleId, filePath)
    }
  }

  async notifyFileClosed(filePath: string): Promise<void> {
    this.untrackDocEverywhere(filePath)
    for (const client of this.clients.values()) {
      await client.notifyFileClosed(filePath)
    }
  }

  private markPending(clientKey: string, lifecycleId: number, filePath: string): void {
    let pending = this.pendingByClient.get(clientKey)
    if (!pending || pending.lifecycleId !== lifecycleId) {
      pending = { lifecycleId, uris: new Set() }
      this.pendingByClient.set(clientKey, pending)
    }
    pending.uris.add(path.resolve(filePath))
  }

  private notifyDiagnosticsArrived(): void {
    for (const waiter of [...this.drainWaiters]) {
      waiter()
    }
  }

  hasPendingDiagnostics(): boolean {
    for (const pending of this.pendingByClient.values()) {
      if (pending.uris.size > 0) return true
    }
    return false
  }

  async drainDiagnostics(timeoutMs?: number): Promise<FileDiagnostics[]> {
    const timeout = timeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS
    const deadline = Date.now() + timeout

    while (true) {
      if (!this.hasPendingDiagnostics()) return []

      const collected = this.collectPending()
      if (collected.serversWithoutDiagnostics.length === 0) {
        this.pendingByClient.clear()
        return collected.files
      }

      const remaining = deadline - Date.now()
      if (remaining <= 0) break

      await new Promise<void>((resolve) => {
        const waiter = (): void => {
          this.drainWaiters.delete(waiter)
          resolve()
        }
        this.drainWaiters.add(waiter)
        const timer = setTimeout(() => {
          this.drainWaiters.delete(waiter)
          resolve()
        }, Math.min(remaining, 50))
        if (typeof timer.unref === 'function') timer.unref()
      })
    }

    const collected = this.collectPending()
    if (collected.files.length > 0) {
      this.pendingByClient.clear()
    }
    return collected.files
  }

  private collectPending(): { files: FileDiagnostics[]; serversWithoutDiagnostics: string[] } {
    const byPath = new Map<string, FileDiagnostics>()
    const serversWithoutDiagnostics: string[] = []

    for (const [clientKey, pending] of this.pendingByClient) {
      const client = this.clients.get(clientKey)
      if (!client || client.lifecycleId !== pending.lifecycleId) continue

      let serverReported = false
      for (const uri of pending.uris) {
        // Presencia, no longitud: "limpio" también cuenta como reportado.
        if (!client.hasPublished(uri)) continue
        serverReported = true
        const diagnostics = client.getDiagnostics(uri)

        if (diagnostics.length > 0) {
          let entry = byPath.get(uri)
          if (!entry) {
            entry = { path: uri, diagnostics: [] }
            byPath.set(uri, entry)
          }
          for (const diagnostic of diagnostics) {
            if (diagnostic.severity !== undefined && diagnostic.severity > 2) continue
            entry.diagnostics.push(normalizeDiagnostic(diagnostic))
          }
        }
      }

      if (!serverReported) serversWithoutDiagnostics.push(clientKey)
    }

    return { files: [...byPath.values()], serversWithoutDiagnostics }
  }

  async readDiagnostics(paths: string[]): Promise<FileDiagnostics[]> {
    const results: FileDiagnostics[] = []
    for (const filePath of paths) {
      const opened = await this.ensureFileOpen(filePath)
      const absolute = path.resolve(filePath)

      const deadline = Date.now() + READ_DIAGNOSTICS_SETTLE_MS
      while (Date.now() < deadline) {
        const missing = opened.some((client) => client.hasDocument(absolute) && !client.hasPublished(absolute))
        if (!missing) break
        await new Promise<void>((resolve) => {
          const waiter = (): void => {
            this.drainWaiters.delete(waiter)
            resolve()
          }
          this.drainWaiters.add(waiter)
          const timer = setTimeout(() => {
            this.drainWaiters.delete(waiter)
            resolve()
          }, Math.min(deadline - Date.now(), 25))
          if (typeof timer.unref === 'function') timer.unref()
        })
      }

      const diagnostics: LspDiagnostic[] = []
      for (const client of this.clients.values()) {
        for (const diagnostic of client.getDiagnostics(filePath)) {
          if (diagnostic.severity !== undefined && diagnostic.severity > 2) continue
          diagnostics.push(normalizeDiagnostic(diagnostic))
        }
      }
      results.push({ path: absolute, diagnostics })
    }
    return results
  }

  // ── Requests ──────────────────────────────────────────────────────────────

  async request(payload: LspRequestPayload): Promise<LspRequestResponse> {
    const timeoutMs = payload.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS

    // Dirigido a UN server concreto (completionItem/resolve, etc.).
    if (payload.serverName) {
      const entry = [...this.clients.entries()].find(([key]) =>
        key === payload.serverName || key.startsWith(`${payload.serverName}@`)
      )
      if (!entry) return { ok: false, results: [], error: `server no corriendo: ${payload.serverName}` }
      try {
        const result = await entry[1].request<unknown>(payload.method, payload.params ?? {}, timeoutMs)
        return { ok: true, results: [{ serverName: payload.serverName, result }] }
      } catch (error) {
        return {
          ok: false,
          results: [],
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }

    let targets: LspClient[]
    if (payload.broadcast) {
      targets = [...this.clients.values()]
    } else {
      if (!payload.filePath) {
        return { ok: false, results: [], error: 'filePath requerido (o broadcast: true)' }
      }
      try {
        targets = await this.ensureFileOpen(payload.filePath)
      } catch (error) {
        return { ok: false, results: [], error: String(error) }
      }
      if (targets.length === 0) {
        return { ok: false, results: [], error: `sin servidor LSP para ${payload.filePath}` }
      }
    }

    const results: LspRequestResponse['results'] = []
    await Promise.all(
      targets.map(async (client) => {
        try {
          const result = await client.request<unknown>(payload.method, payload.params ?? {}, timeoutMs)
          results.push({ serverName: client.serverName, result })
        } catch (error) {
          results.push({
            serverName: client.serverName,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      })
    )

    return { ok: results.some((r) => r.error === undefined), results }
  }

  // ── Estado ────────────────────────────────────────────────────────────────

  status(): LspServerStatus[] {
    const out: LspServerStatus[] = []
    for (const root of this.roots) {
      const names = new Set([
        ...Object.keys(this.serversByRoot.get(root) ?? {}),
        ...[...this.clients.keys()]
          .filter((key) => key.endsWith(`@${root}`))
          .map((key) => key.slice(0, -(root.length + 1)))
      ])
      for (const name of [...names].sort()) {
        const key = this.clientKey(name, root)
        const client = this.clients.get(key)
        const config = this.serversByRoot.get(root)?.[name]
        // Estado REAL: un server bloqueado por crashes fallidos se muestra
        // 'failed' aunque ya no haya cliente vivo.
        let state: LspServerStatus['state'] = client?.getState() ?? 'stopped'
        const error = this.lastErrorByKey.get(key)
        if (this.autoStartBlocked.has(key)) state = 'failed'
        out.push({
          id: key,
          name,
          root,
          state,
          available:
            config?.transport === 'socket' ||
            (this.availabilityByRoot.get(root)?.[name] ?? false),
          source: (this.sourcesByRoot.get(root)?.[name] ?? 'builtin') as LspServerStatus['source'],
          extensions: Object.keys(config?.extensions ?? {}),
          ...(this.dynamicOwnerOf(name) ? { extensionId: this.dynamicOwnerOf(name) } : {}),
          ...(this.disabledServers.has(name) ? { disabled: true } : {}),
          error
        })
      }
    }
    return out
  }

  // ── Crash / restart ──────────────────────────────────────────────────────

  private armRestartMonitor(serverName: string, clientKey: string): void {
    if (this.monitored.has(clientKey)) return
    const root = clientKey.slice(clientKey.lastIndexOf('@') + 1)
    const config = this.serversByRoot.get(root)?.[serverName]
    if (!config?.restartOnCrash) return
    this.monitored.add(clientKey)
    this.restartBudget.set(clientKey, config.maxRestarts ?? 3)
  }

  private async handleCrash(
    serverName: string,
    root: string,
    stderrTail?: string
  ): Promise<void> {
    const clientKey = this.clientKey(serverName, root)
    this.clients.delete(clientKey)

    const hint = crashHint(stderrTail ?? '')
    const detail = [stderrTail?.split('\n').filter(Boolean).pop(), hint]
      .filter(Boolean)
      .join(' · ')

    // Sin restartOnCrash: contar muertes SÚBITAS seguidas y bloquear el
    // auto-start tras 3 — evita el spam de spawn/muerte por cada archivo.
    const config = this.serversByRoot.get(root)?.[serverName]
    if (!config?.restartOnCrash) {
      const deaths = (this.suddenDeaths.get(clientKey) ?? 0) + 1
      this.suddenDeaths.set(clientKey, deaths)
      if (deaths >= 3) {
        this.autoStartBlocked.add(clientKey)
        this.emitEvent({
          serverName,
          state: 'failed',
          error: `falla persistente (${deaths} intentos)` + (detail ? `: ${detail}` : '')
        })
        return
      }
      if (!this.clients.has(clientKey)) {
        this.emitEvent({ serverName, state: 'failed', error: detail || undefined })
      }
      return
    }

    if (!config.restartOnCrash) return

    const budgetBefore = this.restartBudget.get(clientKey) ?? 0
    if (budgetBefore <= 0) {
      this.emitEvent({ serverName, state: 'failed', error: 'presupuesto de reinicios agotado' })
      return
    }
    this.restartBudget.set(clientKey, budgetBefore - 1)

    const attempt = (config.maxRestarts ?? 3) - budgetBefore + 1
    const backoff = Math.min(RESTART_BACKOFF_INITIAL_MS * 2 ** (attempt - 1), RESTART_BACKOFF_MAX_MS)
    this.restarting.add(clientKey)
    this.emitEvent({ serverName, state: 'retrying', attempt, error: `reintento en ${backoff}ms` })

    setTimeout(
      () => {
        void (async () => {
          this.restarting.delete(clientKey)
          if (!(await this.startClient(serverName, root))) return
          // Replay de documentos (réplica de restart.rs).
          const fresh = this.clients.get(clientKey)
          if (!fresh) return
          const docs = this.openDocs.get(clientKey)
          if (!docs) return
          for (const [docPath, languageId] of [...docs.entries()]) {
            try {
              const content = await fs.readFile(docPath, 'utf-8')
              await fresh.notifyFileChange(docPath, content, languageId)
              this.markPending(clientKey, fresh.lifecycleId, docPath)
            } catch {
              docs.delete(docPath)
            }
          }
        })()
      },
      backoff
    ).unref?.()
  }

  /**
   * Si el comando corre desde nuestro dir gestionado de npm y el paquete
   * `typescript` está instalado al lado, inyecta tsserver.path (init options
   * + env TSSERVER_PATH) — typescript-language-server no encuentra el SDK
   * del workspace del usuario.
   */
  private augmentManagedTypeScript(config: LspServerConfig): LspServerConfig {
    if (!config.command.includes('lsp/npm')) return config

    const tsLib = path.join(managedNpmDir(), 'node_modules', 'typescript', 'lib')
    try {
      // tsserver.js vive en <tsLib>/tsserver.js
      accessSync(path.join(tsLib, 'tsserver.js'))
    } catch {
      return config
    }

    const initializationOptions = {
      ...((config.initializationOptions as Record<string, unknown>) ?? {}),
      tsserver: { path: tsLib }
    }
    const env = { ...(config.env ?? {}), TSSERVER_PATH: tsLib }
    return { ...config, initializationOptions, env }
  }

  /** Reinicia todas las instancias `name@*` (shutdown + arranque lazy). */
  async restartServer(serverName: string): Promise<{ ok: boolean; error?: string }> {
    // Restart MANUAL: limpia el circuit breaker.
    for (const key of [...this.autoStartBlocked]) {
      if (key.startsWith(`${serverName}@`)) {
        this.autoStartBlocked.delete(key)
        this.suddenDeaths.delete(key)
      }
    }
    const keys = [...this.clients.keys()].filter((key) =>
      key.startsWith(`${serverName}@`)
    )
    if (keys.length === 0) {
      // No está corriendo: intentar arrancarlo si la config existe.
      this.autoStartBlocked.forEach((_, key) => {
        if (key.startsWith(`${serverName}@`)) this.autoStartBlocked.delete(key)
      })
      const started = await this.ensureServerReady(serverName)
      return started ? { ok: true } : { ok: false, error: 'server no configurado' }
    }
    for (const key of keys) {
      const client = this.clients.get(key)
      this.clients.delete(key)
      this.pendingByClient.delete(key)
      await client?.shutdown()
    }
    // El próximo ensureServersForFile lo vuelve a levantar.
    return { ok: true }
  }

  /**
   * Instalación forzada de la receta del server (builtin o dinámico),
   * ignorando el gate de extensiones del workspace pero NO el opt-out.
   */
  async installNow(serverName: string): Promise<{ ok: boolean; error?: string }> {
    const root = this.roots.find((r) => this.serversByRoot.get(r)?.[serverName])
    if (!root) return { ok: false, error: 'server no registrado' }
    const config = this.serversByRoot.get(root)![serverName]
    if (await commandResolves(config.command)) return { ok: true }

    if (downloadsDisabled()) return { ok: false, error: 'descargas deshabilitadas (SCRAKK_DISABLE_LSP_DOWNLOAD)' }

    const def =
      BUILTIN_SERVERS.find((candidate) => candidate.id === serverName) ??
      this.allDynamicDefs().find((candidate) => candidate.id === serverName)
    if (!def?.install) return { ok: false, error: 'sin receta de instalación' }

    try {
      const installed = await withTimeout(install(def.install as InstallRecipe, config), INSTALL_TIMEOUT_MS)
      ;(this.serversByRoot.get(root) ?? {})[serverName] = installed
      // Disponibilidad REAL actualizada → el badge deja de decir "No instalado".
      const availability = this.availabilityByRoot.get(root) ?? {}
      availability[serverName] = true
      this.availabilityByRoot.set(root, availability)
      this.lastErrorByKey.delete(this.clientKey(serverName, root))
      // Arrancar de una: el usuario instaló para usarlo ya.
      await this.startClient(serverName, root, { manual: true })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  getRunningPid(serverName: string): number | undefined {
    const entry = [...this.clients.entries()].find(([key]) => key.startsWith(`${serverName}@`))
    return entry?.[1].pid
  }

  async shutdownAll(): Promise<void> {
    this.shuttingDown = true
    const clients = [...this.clients.values()]
    this.clients.clear()
    this.pendingByClient.clear()
    this.monitored.clear()
    await Promise.all(clients.map((client) => client.shutdown()))
    this.shuttingDown = false
  }
}

/** Markers de raíz para servers dinámicos (ext type lspServers). */
const DYNAMIC_ROOT_MARKERS = new Map<string, string[]>()

export function setDynamicRootMarkers(id: string, markers: string[] | undefined): void {
  if (markers && markers.length > 0) DYNAMIC_ROOT_MARKERS.set(id, markers)
  else DYNAMIC_ROOT_MARKERS.delete(id)
}

function dynamicRootMarkers(name: string): string[] | undefined {
  const dynamic = DYNAMIC_ROOT_MARKERS.get(name)
  if (dynamic) return dynamic
  const builtin = BUILTIN_SERVERS.find((candidate) => candidate.id === name)
  return builtin?.rootMarkers?.filter((marker) => !marker.includes('*'))
}

const RESTART_BACKOFF_INITIAL_MS = 1_000
const RESTART_BACKOFF_MAX_MS = 30_000
/** Espera máxima de settle en readDiagnostics (CLI: "briefly"). */
const READ_DIAGNOSTICS_SETTLE_MS = 2_000

async function projectDeclaresDependency(root: string, dependency: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(path.join(root, 'package.json'), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>
    const deps = { ...parsed.dependencies, ...parsed.devDependencies }
    return dependency in deps
  } catch {
    return false
  }
}

/** Pistas accionables para fallos conocidos. */
function crashHint(stderrTail: string): string | null {
  const tail = stderrTail.toLowerCase()
  if (tail.includes('unknown binary') && tail.includes('rust-analyzer')) {
    return 'corre: rustup component add rust-analyzer'
  }
  if (tail.includes('enoent') || tail.includes('spawn')) {
    return 'binario no encontrado'
  }
  return null
}

function normalizeDiagnostic(diagnostic: {
  range: LspDiagnostic['range']
  severity?: number
  message: string
  source?: string
  code?: string | number
}): LspDiagnostic {
  return {
    range: diagnostic.range,
    severity: diagnostic.severity,
    message: diagnostic.message,
    source: diagnostic.source,
    code: diagnostic.code
  }
}
