/**
 * Runtime del Extension Host — el proceso Node que EJECUTA la extensión.
 *
 * Recibe del main el ciclo de vida (`init` → `activate`) y las invocaciones
 * de la UI (resolver una vista, ejecutar un comando, entregar un mensaje del
 * webview). Todo lo que la extensión quiere del mundo pasa por el `RpcPeer`,
 * y el `main` es el que autoriza.
 *
 * Este archivo es el PEGAMENTO: conoce el RPC, `require` y `console`, pero
 * NADA de Electron ni de la UI. El `vscode` que ve la extensión lo construye
 * `vscodeApi.ts` sobre un bridge, así que la lógica es testeable sin proceso.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Lo específico del runtime de hoy está concentrado en `installVscodeResolver`
 * (el truco de interceptar `require('vscode')`). Si Owear trae otro mecanismo
 * de módulos, se cambia ESA función y nada más.
 */

import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  HOST_PROTOCOL_VERSION,
  type DocumentEvent,
  type FindFilesResult,
  type FsReadDirectoryResult,
  type FsResultLike,
  type FsStatResult,
  type HostInitParams,
  type LogPayload,
  type MainEvent,
  type NotifyResult,
  type ProviderQueryParams,
  type TreeNodeModel
} from '@shared/extensionHost/protocol'
import { RpcPeer } from './rpc'
import {
  createVscodeApi,
  flattenConfigurationDefaults,
  type ExtensionModule,
  type VscodeApiBundle
} from './vscodeApi'
import type { FsResult, HostBridge } from './vscodeShim'
import { isLanguageClientRequest, loadHostLanguageClient } from './languageClientBridge'

/** Argumentos de la petición `command/execute`. */
interface ExecuteCommandParams {
  id: string
  args?: unknown[]
}

/** Argumentos de `view/resolve`. */
interface ResolveViewParams {
  viewId: string
  title?: string
}

/** Argumentos de `view/receive`. */
interface ReceiveParams {
  viewId: string
  message: unknown
}

export interface HostRuntimeOptions {
  peer: RpcPeer
  /**
   * Carga el módulo de la extensión. Inyectable para tests (y para runtimes
   * futuros que no usen `require`): recibe el `vscode` a entregarle.
   * Si no se pasa, se usa `require(entry)` con `require('vscode')` interceptado.
   */
  loadExtension?: (entryPath: string, vscodeApi: Record<string, unknown>) => ExtensionModule
  /** Reloj inyectable (tests). */
  now?: () => number
}

export interface HostRuntime {
  /** Registra los handlers en el peer. */
  start(): void
  /** Estado actual (para tests). */
  state(): { activated: boolean; extensionId: string | null; commands: string[] }
}

/** Captura `console.*` hacia el main para que los logs se vean en el IDE. */
function captureConsole(emit: (level: LogPayload['level'], message: string) => void): () => void {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  }
  let inside = false

  const wrap =
    (level: LogPayload['level'], fallback: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      fallback(...args)
      if (inside) return
      inside = true
      try {
        emit(
          level,
          args
            .map((a) => (typeof a === 'string' ? a : safeInspect(a)))
            .join(' ')
        )
      } finally {
        inside = false
      }
    }

  console.log = wrap('log', original.log)
  console.info = wrap('info', original.info)
  console.warn = wrap('warn', original.warn)
  console.error = wrap('error', original.error)

  return () => {
    console.log = original.log
    console.info = original.info
    console.warn = original.warn
    console.error = original.error
  }
}

/**
 * ¿Es un `MODULE_NOT_FOUND` DEL SPECIFIER PEDIDO?
 *
 * La distinción importa: si la extensión SÍ trae el paquete y lo que falta es
 * una dependencia suya, caer a nuestra copia taparía el problema real de la
 * extensión. Sólo se responde por un specifier que no existe en ningún lado.
 */
export function isModuleNotFoundError(error: unknown, request: string): boolean {
  if (!error || typeof error !== 'object') return false
  if ((error as { code?: unknown }).code !== 'MODULE_NOT_FOUND') return false
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(`'${request}'`) || message.includes(`"${request}"`)
}

function safeInspect(value: unknown): string {
  try {
    if (value instanceof Error) return `${value.name}: ${value.message}`
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Intercepta `require('vscode')` para devolver nuestro shim.
 *
 * Es el único punto que depende del sistema de módulos de Node (CJS). Los
 * bundles de las extensiones de VS Code suelen ser CJS (webpack/esbuild), así
 * que esto cubre el caso real. Devuelve un `restore()` por si hay que
 * deshacerlo en tests.
 */
export function installVscodeResolver(api: () => Record<string, unknown>): () => void {
  // `__filename` no existe si este módulo se carga como ESM (tests).
  const base = typeof __filename === 'string' ? __filename : process.cwd()
  const nodeRequire = createRequire(base)
  const moduleExports = nodeRequire('module') as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
    _resolveFilename: (
      request: string,
      parent: unknown,
      isMain: boolean,
      options?: { paths?: string[] }
    ) => string
    _resolveLookupPaths: (request: string, parent: unknown) => string[] | null
  }
  const originalLoad = moduleExports._load
  const originalResolveFilename = moduleExports._resolveFilename
  const originalResolveLookupPaths = moduleExports._resolveLookupPaths

  // ── CJS: `require('vscode')` ────────────────────────────────────────────
  /**
   * `require.resolve('vscode')` también tiene que andar: hay extensiones que
   * resuelven la ruta del módulo del API (VS Code parchea estos mismos hooks).
   * El stub no existe en disco, así que el `_load` lo tiene que reconocer.
   */
  const VSCODE_STUB = join(dirname(base), '__vscode_stub__.js')
  const isVscodeRequest = (request: string): boolean =>
    request === 'vscode' || request === VSCODE_STUB

  /**
   * `vscode-languageclient` (la lib REAL del protocolo).
   *
   * Precedencia: la copia de la EXTENSIÓN manda (es su versión fijada); la del
   * host es el respaldo para el caso "lo declara como dependencia externa y no
   * lo trae instalado". Sólo se avisa cuando se usa el respaldo: que una
   * extensión bundlee su cliente es lo normal y no merece una línea de log.
   */
  let languageClientFallbackUsed = false

  moduleExports._load = function patchedLoad(
    this: unknown,
    request: string,
    parent: unknown,
    isMain: boolean
  ): unknown {
    if (isVscodeRequest(request)) return api()
    if (isLanguageClientRequest(request)) {
      try {
        return originalLoad.call(this, request, parent, isMain)
      } catch (error) {
        if (!isModuleNotFoundError(error, request)) throw error
        const resolved = loadHostLanguageClient(request)
        if (!languageClientFallbackUsed) {
          languageClientFallbackUsed = true
          console.error(
            `[extension-host] \`${request}\` no vino con la extensión: se usa la copia de Scrakk (${resolved.path})`
          )
        }
        return resolved.module
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  moduleExports._resolveFilename = function patchedResolve(
    this: unknown,
    request: string,
    parent: unknown,
    isMain: boolean,
    resolveOptions?: { paths?: string[] }
  ): string {
    if (request === 'vscode') return VSCODE_STUB
    if (isLanguageClientRequest(request)) {
      try {
        return originalResolveFilename.call(this, request, parent, isMain, resolveOptions)
      } catch (error) {
        if (!isModuleNotFoundError(error, request)) throw error
        return loadHostLanguageClient(request).path
      }
    }
    return originalResolveFilename.call(this, request, parent, isMain, resolveOptions)
  }
  moduleExports._resolveLookupPaths = function patchedLookup(
    this: unknown,
    request: string,
    parent: unknown
  ): string[] | null {
    if (request === 'vscode') return []
    return originalResolveLookupPaths.call(this, request, parent)
  }

  // ── ESM: `import 'vscode'` ───────────────────────────────────────────────
  // VS Code resuelve `'vscode'` (desde un padre ESM) a un módulo `data:` que
  // re-exporta las claves del API. Así una extensión ESM NO necesita un
  // `node_modules/vscode` real ni un alias de bundler.
  let deregister: (() => void) | null = null
  const registerHooks = (moduleExports as unknown as { registerHooks?: unknown }).registerHooks
  if (typeof registerHooks === 'function') {
    const makeDataUrl = (instance: Record<string, unknown>): string => {
      const code = `const api = globalThis.__SCRAKK_VSCODE_API__();\n${Object.keys(instance)
        .map((name) => `export const ${name} = api['${name}'];`)
        .join('\n')}`
      return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    }
    const globalHolder = globalThis as { __SCRAKK_VSCODE_API__?: () => Record<string, unknown> }
    globalHolder.__SCRAKK_VSCODE_API__ = api
    let cachedUrl: string | null = null

    const hooks = (
      moduleExports as unknown as {
        registerHooks: (hooks: {
          resolve: (
            specifier: string,
            context: { parentURL?: string },
            nextResolve: (specifier: string, context: { parentURL?: string }) => { url: string }
          ) => { url: string; shortCircuit?: boolean }
        }) => { deregister: () => void }
      }
    ).registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier !== 'vscode' || !context.parentURL) return nextResolve(specifier, context)
        cachedUrl ??= makeDataUrl(api())
        return { url: cachedUrl, shortCircuit: true }
      }
    })
    deregister = () => hooks.deregister()
  } else {
    // Node sin `registerHooks`: se avisa (no se finge soporte ESM).
    console.error(
      '[extension-host] este Node no soporta `module.registerHooks`: las extensiones ESM no podrán importar "vscode"'
    )
  }

  return () => {
    moduleExports._load = originalLoad
    moduleExports._resolveFilename = originalResolveFilename
    moduleExports._resolveLookupPaths = originalResolveLookupPaths
    deregister?.()
  }
}

export function createHostRuntime(options: HostRuntimeOptions): HostRuntime {
  const { peer } = options
  let init: HostInitParams | null = null
  let bundle: VscodeApiBundle | null = null
  let extensionModule: ExtensionModule | null = null
  /** Promesa de activación (una sola corrida por host; ver `activate`). */
  let activation: Promise<{ commands: string[] }> | null = null
  let restoreResolver: (() => void) | null = null
  let restoreConsole: (() => void) | null = null
  let restoreDocumentEvents: (() => void) | null = null

  const emitLog = (level: LogPayload['level'], message: string): void =>
    peer.emit('log', { level, message } satisfies LogPayload)

  /** Traduce una ruta absoluta del paquete al esquema servible del webview. */
  function toWebviewUri(absolutePath: string): string {
    const base = init?.extensionPath ?? ''
    const separator = base.includes('\\') ? '\\' : '/'
    const rel = base && absolutePath.startsWith(base) ? relative(base, absolutePath) : absolutePath
    const normalized = rel.split(separator).join('/').replace(/^\/+/, '')
    return `scrakk-ext://${init?.extensionId ?? 'unknown'}/${normalized}`
  }

  function buildBridge(): HostBridge {
    return {
      workspaceRoots: () => init?.workspaceRoots ?? [],
      readFile: async (path: string): Promise<FsResult<string>> => {
        const result = await peer.request<FsResultLike<string>>('fs/read', { path })
        return { success: result.success, value: result.value, error: result.error }
      },
      writeFile: async (path: string, content: string): Promise<FsResult<void>> => {
        const result = await peer.request<FsResultLike<void>>('fs/write', { path, content })
        return { success: result.success, error: result.error }
      },
      asWebviewUri: toWebviewUri,
      showNotification: async (payload): Promise<number | undefined> => {
        const result = await peer.request<NotifyResult>('notify', payload)
        return result?.actionIndex
      },
      executeCommand: (id: string, args: unknown[]) =>
        peer.request('command/execute', { id, args }),
      reportCommand: (id: string, registered: boolean) =>
        peer.emit('command/registered', { id, registered }),
      pushViewHtml: (viewId: string, html: string) => peer.emit('view/html', { viewId, html }),
      pushViewTitle: (viewId: string, title: string) => peer.emit('view/title', { viewId, title }),
      pushViewMessage: (viewId: string, message: unknown) =>
        peer.emit('view/post', { viewId, message }),
      pushTree: (viewId: string, nodes: TreeNodeModel[]) => peer.emit('view/tree', { viewId, nodes }),
      pushTreeChange: (viewId: string, elementId?: string) =>
        peer.emit('view/tree-change', { viewId, elementId }),
      pushStatusItem: (item) => peer.emit('status/item', item),
      pushDiagnostics: (payload) => peer.emit('diagnostics/change', payload),
      pushDecorations: (payload) => peer.emit('decorations/set', payload),
      pushPanel: (model) => peer.emit('panel/open', model),
      // El HTML viaja igual que el de las vistas: el main lo cachea y
      // `scrakk-ext://<ext>/panel/<id>` lo sirve. El renderer solo monta la tab.
      pushPanelHtml: (id, html) =>
        peer.emit('panel/update', { id, html, hasHtml: html.length > 0 }),
      pushPanelMessage: (id, message) => peer.emit('view/post', { viewId: id, message }),
      pushPanelClose: (id) => peer.emit('panel/close', { id }),
      findFiles: async (pattern, findOptions) => {
        const result = await peer.request<FindFilesResult>('workspace/find', {
          pattern,
          maxResults: findOptions?.maxResults
        })
        return result ?? { paths: [], truncated: false }
      },
      openInEditor: async (path: string): Promise<{ success: boolean; error?: string }> => {
        const result = await peer.request<{ success?: boolean; error?: string }>('editor/open', {
          path
        })
        return { success: result?.success !== false, error: result?.error }
      },
      openExternal: async (target: string): Promise<{ success: boolean; error?: string }> => {
        const result = await peer.request<{ success?: boolean; error?: string }>(
          'host/open-external',
          { target }
        )
        return { success: result?.success !== false, error: result?.error }
      },
      stat: (path) => peer.request<FsStatResult>('fs/stat', { path }),
      readDirectory: (path) => peer.request<FsReadDirectoryResult>('fs/read-directory', { path }),
      createDirectory: (path) => peer.request<FsResultLike<void>>('fs/create-directory', { path }),
      deletePath: (path, deleteOptions) =>
        peer.request<FsResultLike<void>>('fs/delete', { path, ...deleteOptions }),
      rename: (from, to, moveOptions) =>
        peer.request<FsResultLike<void>>('fs/rename', { from, to, ...moveOptions }),
      copy: (from, to, copyOptions) =>
        peer.request<FsResultLike<void>>('fs/copy', { from, to, ...copyOptions }),
      writeState: async (scope, key, value): Promise<void> => {
        await peer.request('state/write', { scope, key, value })
      },
      getSecret: (key) => peer.request<FsResultLike<string>>('secrets/get', { key }),
      storeSecret: (key, value) => peer.request<FsResultLike<void>>('secrets/store', { key, value }),
      deleteSecret: (key) => peer.request<FsResultLike<void>>('secrets/delete', { key }),
      writeConfiguration: (section, value, target) =>
        peer.request<FsResultLike<void>>('configuration/write', { section, value, target }),
      // El main manda HECHOS de la UI (documentos abiertos, activo). Se
      // registran uno por evento: `MainEvent` y `DocumentEvent['kind']`
      // comparten nombre (`doc/open` → `open`), así que el mapeo es directo.
      onMainEvent: (listener) => {
        const events: MainEvent[] = [
          'doc/open',
          'doc/change',
          'doc/close',
          'doc/save',
          'doc/active',
          // El ajuste de telemetría cambia en caliente: la extensión lo ve
          // por `env.onDidChangeTelemetryEnabled` en vez de quedar con el
          // valor que leyó al activar.
          'env/telemetry'
        ]
        const disposers = events.map((event) =>
          peer.on(event, (payload) => listener(event, payload))
        )
        return () => {
          for (const dispose of disposers) dispose()
        }
      },
      log: emitLog
    }
  }


  /** Desenvuelve `{ default: { activate } }` (cómo empaquetan algunos bundles). */
  function unwrapModule(loaded: unknown): ExtensionModule {
    if (loaded && typeof loaded === 'object' && 'default' in loaded) {
      const inner = (loaded as { default?: ExtensionModule }).default
      if (inner && (typeof inner.activate === 'function' || typeof inner.deactivate === 'function')) {
        return inner
      }
    }
    return loaded as ExtensionModule
  }

  /**
   * Carga el entry como VS Code: CJS con `require` (+`vscode` interceptado) o
   * ESM con `import()` cuando el paquete declara `type: "module"` / `.mjs`
   * (ver `_isESM` en `extHostExtensionService.ts`).
   *
   * El `require` se ancla al `package.json` del PAQUETE (no al del host) para
   * que un bundle con sus propias `node_modules` resuelva como en VS Code.
   */
  async function loadExtensionModule(entryPath: string): Promise<ExtensionModule> {
    const resolved = isAbsolute(entryPath) ? entryPath : join(init?.extensionPath ?? '', entryPath)
    if (init?.esm) {
      // El interceptor de `vscode` para ESM lo instaló `installVscodeResolver`.
      const loaded = (await import(pathToFileURL(resolved).href)) as ExtensionModule
      return unwrapModule(loaded)
    }
    const extensionRequire = createRequire(
      join(init?.extensionPath ?? dirname(entryPath), 'package.json')
    )
    return unwrapModule(extensionRequire(resolved))
  }

  function setup(params: HostInitParams): void {
    init = params
    const bridge = buildBridge()
    bundle = createVscodeApi({
      bridge,
      extensionId: params.extensionId,
      extensionPath: params.extensionPath,
      permissions: params.permissions,
      mode: params.mode,
      configurationDefaults: params.configurationDefaults ?? {},
      configurationValues: params.configurationValues,
      storage: params.storage,
      packageJSON: params.packageJSON,
      globalState: params.globalState,
      workspaceState: params.workspaceState,
      env: params.env
    })
    // Documentos: PRIMERO el snapshot que viene en `init` (la extensión ya los
    // ve en `activate()`, no en el primer cambio) y después los hechos vivos.
    if (params.documents?.length) bundle.seedDocuments(params.documents)
    restoreDocumentEvents = bridge.onMainEvent((event, payload) => {
      // `env/telemetry` NO es un hecho de documento: tiene su propio destino.
      if (event === 'env/telemetry') {
        const { enabled } = payload as { enabled?: boolean }
        bundle?.setTelemetryEnabled(enabled === true)
        return
      }
      const kind = event.slice('doc/'.length) as DocumentEvent['kind']
      bundle?.applyDocumentEvent({ kind, ...(payload as object) } as DocumentEvent)
    })
    restoreConsole = captureConsole(emitLog)
  }

  async function runActivation(): Promise<{ commands: string[] }> {
    if (!init || !bundle) throw new Error('activate sin init: el host no está configurado')
    const entryPath = isAbsolute(init.entry) ? init.entry : join(init.extensionPath, init.entry)
    if (options.loadExtension) {
      extensionModule = options.loadExtension(entryPath, bundle.api)
    } else {
      // El resolver queda instalado ANTES de cargar: la extensión puede hacer
      // `require('vscode')` / `import 'vscode'` en cualquier momento.
      restoreResolver = installVscodeResolver(() => bundle?.api ?? {})
      extensionModule = await loadExtensionModule(entryPath)
    }
    try {
      await bundle.activate(extensionModule)
    } catch (error) {
      // Con el stack COMPLETO: sin esto sólo viaja el mensaje y no se ve en qué
      // línea del bundle de la extensión murió (Cline tiene 21 MB).
      emitLog(
        'error',
        `activate falló: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
      )
      throw error
    }
    emitLog('info', `extensión activada: ${init.extensionId}`)
    return { commands: bundle.registeredCommands() }
  }

  /**
   * Activación de la extensión: UNA SOLA VEZ por host.
   *
   * VS Code nunca llama `activate` dos veces (`_activateExtension` se guarda la
   * promesa y los que llegan después esperan ESA). Repetirla es peor que un
   * error: la extensión ya está a medio inicializar y su segunda corrida tira
   * un fallo distinto que TAPA la causa real (medido con Cline: el segundo
   * `activate` devolvía "Host provider has already been initialized.", un
   * mensaje suyo, y el error verdadero quedaba invisible).
   *
   * Si el `activate` falla, la promesa rechazada se REUSA: todos los que
   * pregunten ven el mismo error original, no una segunda corrida.
   */
  function activate(): Promise<{ commands: string[] }> {
    activation ??= runActivation()
    return activation
  }

  return {
    start(): void {
      peer.handle('init', (raw) => {
        setup(raw as HostInitParams)
        return { protocolVersion: HOST_PROTOCOL_VERSION }
      })

      peer.handle('activate', () => activate())

      peer.handle('deactivate', async () => {
        if (bundle && extensionModule) await bundle.deactivate(extensionModule)
        restoreConsole?.()
        restoreResolver?.()
        restoreDocumentEvents?.()
        restoreDocumentEvents = null
        return { ok: true }
      })

      peer.handle('command/execute', async (raw) => {
        if (!bundle) throw new Error('command/execute sin init')
        const params = raw as ExecuteCommandParams
        // NO se limita a los comandos locales: la UI también pide built-ins
        // del entorno por aquí (`workbench.action.*`), y esos los resuelve el
        // IDE. Con `executeLocalCommand` el botón de un `viewsWelcome` que
        // llama a un built-in moría con "la extensión no registró el comando".
        return await bundle.executeCommand(params.id, params.args ?? [])
      })

      peer.handle('view/resolve', async (raw) => {
        if (!bundle) throw new Error('view/resolve sin init')
        const params = raw as ResolveViewParams
        const kind = await bundle.resolveView(params.viewId, params.title ?? params.viewId)
        return { ok: true, kind }
      })

      peer.handle('tree/children', async (raw) => {
        if (!bundle) throw new Error('tree/children sin init')
        const params = raw as { viewId: string; elementId: string | null }
        return { nodes: await bundle.treeChildren(params.viewId, params.elementId ?? null) }
      })

      peer.handle('tree/select', async (raw) => {
        if (!bundle) throw new Error('tree/select sin init')
        const params = raw as { viewId: string; elementId: string }
        return await bundle.treeSelect(params.viewId, params.elementId)
      })

      // Proveedores de lenguaje: el IDE pregunta (hover, definición,
      // formateo…). Sin esto, el LSP de una extensión arrancaba y nadie le
      // preguntaba nada (ver `languageProviders.ts`).
      peer.handle('provider/query', async (raw) => {
        if (!bundle) throw new Error('provider/query sin init')
        return await bundle.queryProvider(raw as ProviderQueryParams)
      })

      peer.handle('view/dispose', (raw) => {
        const params = raw as { viewId: string }
        bundle?.disposeView(params.viewId)
        return { ok: true }
      })

      peer.handle('panel/dispose', (raw) => {
        const params = raw as { panelId: string }
        bundle?.disposePanel(params.panelId)
        return { ok: true }
      })

      peer.handle('view/receive', (raw) => {
        const params = raw as ReceiveParams
        bundle?.deliverViewMessage(params.viewId, params.message)
        return { ok: true }
      })

      // Los errores NO capturados del proceso los engancha `entry.ts`: son
      // un asunto del proceso, no del runtime (y así este módulo no toca
      // globales y se puede testear varias veces en el mismo proceso).
      peer.emit('ready', { protocolVersion: HOST_PROTOCOL_VERSION })
    },

    state: () => ({
      activated: extensionModule !== null,
      extensionId: init?.extensionId ?? null,
      commands: bundle?.registeredCommands() ?? []
    })
  }
}

/** Re-export útil para el entry (y para los tests). */
export { flattenConfigurationDefaults, type ExtensionModule, type VscodeApiBundle }
