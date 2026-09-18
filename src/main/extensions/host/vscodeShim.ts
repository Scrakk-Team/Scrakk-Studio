/**
 * Shim del API `vscode` para extensiones ejecutadas en el Extension Host.
 *
 * Las APIs que NO están se declaran en la tabla única de superficie
 * (`shared/compatibility/surface`), que es la misma que alimenta el reporte
 * de compatibilidad del instalador.
 *
 * Una extensión de VS Code NO recibe `vscode` desde `node_modules`: se lo
 * **inyecta el host**. Acá se construye ese módulo, apoyado en un `HostBridge`
 * (transporte inyectable) para que sea testeable sin proceso ni stdio.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ALCANCE v1 (deliberadamente chico y honesto)
 *
 * Implementado — lo que necesitan los paneles de la activity bar:
 *  - `window.registerWebviewViewProvider` (el caso de los paneles tipo chat
 *    con IA: la extensión publica HTML y habla por mensajes).
 *  - `window.registerTreeDataProvider` / `createTreeView` con `TreeItem`,
 *    `TreeItemCollapsibleState` y `ThemeIcon` (los paneles de árbol, el otro
 *    sabor de panel de la activity bar; ver `treeViews.ts`).
 *  - `commands.registerCommand` / `executeCommand` (puente al registry real
 *    del IDE; aparecen en la paleta y en los botones de la titlebar).
 *  - `window.show{Information,Warning,Error}Message` → notificaciones reales.
 *  - `workspace` (folders, `fs` enjaulado), `Uri`, `EventEmitter`,
 *    `Disposable`, `ExtensionContext` y mementos en memoria.
 *
 * INERTE a propósito (existe para que `activate()` no explote, avisa UNA vez
 * por host en el log y todavía no hace nada): item de barra de estado,
 * decoraciones del editor, watchers de archivos, diagnósticos y los
 * proveedores de `languages`. Sin esto, una extensión real de paneles muere al
 * activarse con "X is not a function" y el panel ni aparece (medido con
 * Comment Anchors, que se suscribe a media docena de estos al arrancar).
 *
 * NO implementado (falla con mensaje explícito, jamás en silencio):
 *  - `createWebviewPanel` (webviews EN EL EDITOR, no en la activity bar),
 *    editores de texto, debug, tasks, SCM, `showQuickPick`/`showInputBox`.
 *    Tirar un error claro es mejor que devolver un objeto vacío que rompa a
 *    la extensión en un lugar lejano.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Este archivo NO sabe de Node, ni de stdio, ni de Electron: sólo llama al
 * `HostBridge`. Cuando Owear reemplace el runtime de ejecución se conserva
 * este shim entero y se cambia el bridge. Por eso nada de `process`, `fs` ni
 * `child_process` acá adentro.
 */

// El motivo de una API que no está sale de la tabla única de superficie: la
// misma que alimenta el reporte de compatibilidad del instalador.
import { findSurfaceEntry } from '@shared/compatibility/surface'
import type {
  ExtensionEnvInfo,
  ExtensionHostMode,
  ExtensionDecorationsPayload,
  ExtensionDiagnosticsPayload,
  ExtensionStoragePaths,
  FileStatModel,
  FindFilesResult,
  FsReadDirectoryResult,
  FsStatResult,
  LogPayload,
  MainEvent,
  MementoScope,
  NotifyPayload,
  StatusBarItemPayload,
  TreeNodeModel,
  WebviewPanelModel
} from '@shared/extensionHost/protocol'

// ── Bridge (lo que el host le ofrece al shim) ─────────────────────────────

/** Resultado de una operación de filesystem delegada al proceso main. */
export interface FsResult<T = string> {
  success: boolean
  value?: T
  error?: string
}

/** Superficie mínima que el shim necesita del transporte. */
export interface HostBridge {
  workspaceRoots(): string[]
  readFile(path: string): Promise<FsResult<string>>
  writeFile(path: string, content: string): Promise<FsResult<void>>
  /** `workspace.fs.stat` (el jail y los permisos los aplica el main). */
  stat(path: string): Promise<FsStatResult>
  /** `workspace.fs.readDirectory`. */
  readDirectory(path: string): Promise<FsReadDirectoryResult>
  createDirectory(path: string): Promise<FsResult<void>>
  deletePath(path: string, options?: { recursive?: boolean; useTrash?: boolean }): Promise<FsResult<void>>
  rename(from: string, to: string, options?: { overwrite?: boolean }): Promise<FsResult<void>>
  copy(from: string, to: string, options?: { overwrite?: boolean }): Promise<FsResult<void>>
  /** Persiste un valor de memento (`globalState` / `workspaceState`). */
  writeState(scope: MementoScope, key: string, value: unknown): Promise<void>
  /** `SecretStorage.get` (el main guarda y cifra). */
  getSecret(key: string): Promise<FsResult<string>>
  storeSecret(key: string, value: string): Promise<FsResult<void>>
  deleteSecret(key: string): Promise<FsResult<void>>
  /** `getConfiguration().update`: persistencia en el main. */
  writeConfiguration(section: string, value: unknown, target?: number): Promise<FsResult<void>>
  /** Resuelve una ruta del paquete al esquema servible por el webview. */
  asWebviewUri(absolutePath: string): string
  showNotification(payload: NotifyPayload): Promise<number | undefined>
  executeCommand(id: string, args: unknown[]): Promise<unknown>
  reportCommand(id: string, registered: boolean): void
  pushViewHtml(viewId: string, html: string): void
  pushViewTitle(viewId: string, title: string): void
  pushViewMessage(viewId: string, message: unknown): void
  /** Nodos raíz de una vista de árbol (snapshot). */
  pushTree(viewId: string, nodes: TreeNodeModel[]): void
  /** El provider pidió refrescar (undefined = toda la vista). */
  pushTreeChange(viewId: string, elementId?: string): void
  /** Item de la barra de estado nuevo/actualizado (o quitado: `removed`). */
  pushStatusItem(item: StatusBarItemPayload): void
  /**
   * La extensión publicó/limpió diagnósticos: la UI los pinta.
   * Va en cada cambio (no se acumula): el problema que ya no está se limpia
   * porque el payload trae su entrada con la lista vacía.
   */
  pushDiagnostics(payload: ExtensionDiagnosticsPayload): void
  /**
   * La extensión subrayó rangos (`editor.setDecorations`): el IDE los pinta en
   * el editor. Va el estado completo de los archivos tocados (ver el payload).
   */
  pushDecorations(payload: ExtensionDecorationsPayload): void
  /** Panel de webview abierto o actualizado (título, visibilidad). */
  pushPanel(model: WebviewPanelModel): void
  /** HTML de un panel de webview (lo sirve `scrakk-ext://…/panel/<id>`). */
  pushPanelHtml(id: string, html: string): void
  /** Mensaje de la extensión hacia el iframe de un panel. */
  pushPanelMessage(id: string, message: unknown): void
  /** El panel se cerró (la tab se va). */
  pushPanelClose(id: string): void
  /** Busca archivos del workspace (el main camina el disco y aplica el jail). */
  findFiles(pattern: string, options?: { maxResults?: number }): Promise<FindFilesResult>
  /** Pide al IDE abrir un archivo en el editor. */
  openInEditor(path: string, options?: { preview?: boolean }): Promise<{ success: boolean; error?: string }>
  /** Abre un link/archivo con el sistema operativo (`env.openExternal`). */
  openExternal(target: string): Promise<{ success: boolean; error?: string }>
  /**
   * Se suscribe a los hechos del IDE (documentos abiertos, activo).
   * El host los refleja en `workspace.textDocuments` y sus eventos.
   */
  onMainEvent(listener: (event: MainEvent, payload: unknown) => void): () => void
  log(level: LogPayload['level'], message: string): void
}

export interface VscodeShimOptions {
  bridge: HostBridge
  extensionId: string
  extensionPath: string
  permissions: readonly string[]
  mode: ExtensionHostMode
  /** Valores por defecto de `getConfiguration` (contributes.configuration). */
  configurationDefaults?: Record<string, unknown>
  /** Ajustes ya persistidos por la extensión (pisan a los defaults). */
  configurationValues?: Record<string, unknown>
  /** Directorios PROPIOS de la extensión, ya creados por el main. */
  storage?: ExtensionStoragePaths
  /** `package.json` real del paquete (`context.extension.packageJSON`). */
  packageJSON?: Record<string, unknown>
  /** Estado persistido que el main leyó antes de activar. */
  globalState?: Record<string, unknown>
  workspaceState?: Record<string, unknown>
  /** Entorno del IDE (`env.*`). */
  env?: ExtensionEnvInfo
}

/** `FileType` de VS Code. */
export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 } as const

/** Traduce el `FileStat` serializado del main a la clase del API. */
export class FileStatImpl {
  constructor(
    readonly type: number,
    readonly ctime: number,
    readonly mtime: number,
    readonly size: number
  ) {}

  static from(model: FileStatModel): FileStatImpl {
    return new FileStatImpl(model.type, model.ctime, model.mtime, model.size)
  }
}

// ── Primitivas (la parte del API que no depende del host) ─────────────────

export interface DisposableLike {
  dispose(): void
}

export class Disposable implements DisposableLike {
  private disposed = false

  constructor(private readonly callOnDispose: () => void) {}

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.callOnDispose()
  }

  static from(...disposables: DisposableLike[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) d.dispose()
    })
  }
}

export function disposable(fn: () => void): Disposable {
  return new Disposable(fn)
}

/**
 * `CancellationError` del API.
 *
 * Lo lanza el cliente LSP real cuando se cancela un request
 * (`vscode-languageclient` lo usa en su manejo de cancelación), y las
 * extensiones lo atrapan con `instanceof`. Faltaba: sin la clase, un
 * `catch (e) { if (e instanceof vscode.CancellationError) }` reventaba con
 * "Right-hand side of 'instanceof' is not callable" — un error que parece de
 * la extensión y es del host.
 */
export class CancellationError extends Error {
  constructor() {
    super('Canceled')
    this.name = 'Canceled'
  }
}

/** Mínimo `Uri` (file). Basta para lo que usan las extensiones de paneles. */
export class Uri {
  constructor(
    readonly scheme: string,
    readonly authority: string,
    readonly path: string,
    readonly query: string = '',
    readonly fragment: string = ''
  ) {}

  static file(p: string): Uri {
    return new Uri('file', '', p.replace(/\\/g, '/'))
  }

  /**
   * `parse` acepta las dos formas (`scheme://authority/path` y `scheme:path`) y
   * CONSERVA query y fragment: las extensiones meten datos ahí (Cline, por
   * ejemplo, marca en un documento virtual `cline-diff:` qué versión mostrar) y
   * perderlos cambiaba el contenido que se pedía.
   */
  static parse(value: string): Uri {
    const match = /^([a-zA-Z][\w+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(
      value
    )
    if (!match) return new Uri('file', '', value)
    return new Uri(match[1], match[2] ?? '', match[3] || '/', match[4] ?? '', match[5] ?? '')
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    const parts = [base.path.replace(/\/+$/, ''), ...segments.map((s) => s.replace(/^\/+|\/+$/g, ''))]
    return new Uri(base.scheme, base.authority, parts.join('/'), base.query, base.fragment)
  }

  /** Cambia partes de la URI conservando el resto (como `Uri.with` de VS Code). */
  with(change: {
    scheme?: string
    authority?: string
    path?: string
    query?: string
    fragment?: string
  }): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment
    )
  }

  get fsPath(): string {
    return this.path
  }

  toString(): string {
    // `file:` siempre lleva `//` (file:///home/x); un esquema sin authority y
    // sin barras (como `untitled:`) se escribe tal cual, que es como lo espera
    // quien lo registró.
    const authority = this.authority ? `//${this.authority}` : this.scheme === 'file' ? '//' : ''
    const query = this.query ? `?${this.query}` : ''
    const fragment = this.fragment ? `#${this.fragment}` : ''
    return `${this.scheme}:${authority}${this.path}${query}${fragment}`
  }

  toJSON(): string {
    return this.toString()
  }
}

type Listener<T> = (value: T) => void

/** `EventEmitter` con la forma exacta del API de VS Code. */
export class EventEmitter<T> implements DisposableLike {
  private readonly listeners = new Set<Listener<T>>()

  readonly event = (listener: Listener<T>): Disposable => {
    this.listeners.add(listener)
    return new Disposable(() => this.listeners.delete(listener))
  }

  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(value)
      } catch (error) {
        // Un listener roto no puede tumbar a los demás ni al host.
        void error
      }
    }
  }

  dispose(): void {
    this.listeners.clear()
  }
}

// ── Webview ───────────────────────────────────────────────────────────────

export interface WebviewNotice {
  /** HTML publicado por la extensión (ya envuelto por el host). */
  html: string
  title: string
  posted: unknown[]
}

/**
 * Estado de UNA vista webview. El shim NO sabe de iframes: junta el HTML y
 * los mensajes y los empuja por el bridge. El `main` los cachea y el
 * renderer los pinta.
 */
export class WebviewViewHandle {
  private htmlValue = ''
  private titleValue: string
  private disposed = false

  private readonly messageEmitter = new EventEmitter<unknown>()
  private readonly visibilityEmitter = new EventEmitter<{ visible: boolean }>()
  private readonly disposeEmitter = new EventEmitter<void>()

  readonly webview: {
    html: string
    options: Record<string, unknown>
    cspSource: string
    asWebviewUri: (uri: Uri) => Uri
    postMessage: (message: unknown) => Promise<boolean>
    onDidReceiveMessage: (listener: (message: unknown) => void) => Disposable
  }

  constructor(
    readonly viewId: string,
    initialTitle: string,
    private readonly options: VscodeShimOptions
  ) {
    this.titleValue = initialTitle
    // `host` se captura para que los getters/setters del literal (donde
    // `this` es el propio literal) alcancen el estado de la instancia.
    const host = this
    this.webview = {
      get html(): string {
        return host.htmlValue
      },
      set html(value: string) {
        host.htmlValue = value
        host.options.bridge.pushViewHtml(host.viewId, value)
        host.options.bridge.log(
          'info',
          `webview "${host.viewId}" publicó HTML (${value.length} bytes)`
        )
      },
      options: {},
      cspSource: 'scrakk-ext:',
      asWebviewUri: (uri: Uri): Uri =>
        Uri.parse(host.options.bridge.asWebviewUri(uri.path)),
      postMessage: async (message: unknown): Promise<boolean> => {
        host.options.bridge.pushViewMessage(host.viewId, message)
        return true
      },
      onDidReceiveMessage: (listener: (message: unknown) => void): Disposable =>
        host.messageEmitter.event(listener)
    }
  }

  /** Igual que el `viewType` del API: el id global de la vista. */
  get viewType(): string {
    return this.viewId
  }

  get title(): string {
    return this.titleValue
  }

  set title(value: string) {
    this.titleValue = value
    this.options.bridge.pushViewTitle(this.viewId, value)
  }

  get visible(): boolean {
    return !this.disposed
  }

  readonly onDidChangeVisibility = (listener: (e: { visible: boolean }) => void): Disposable =>
    this.visibilityEmitter.event(listener)

  readonly onDidDispose = (listener: () => void): Disposable => this.disposeEmitter.event(listener)

  /** Entrega un mensaje que vino del iframe. */
  deliver(message: unknown): void {
    this.messageEmitter.fire(message)
  }

  show(): void {
    this.visibilityEmitter.fire({ visible: true })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.disposeEmitter.fire()
    this.messageEmitter.dispose()
    this.visibilityEmitter.dispose()
    this.disposeEmitter.dispose()
  }
}

/** Error honesto para API de VS Code que el host v1 no implementa. */
/**
 * Error estándar de una API que el host no cubre.
 *
 * El MOTIVO no se escribe acá: sale de la tabla única de superficie
 * (`shared/compatibility/surface`), que es la misma que alimenta el reporte
 * de compatibilidad. Así el error que ve la extensión y lo que promete el
 * cartel de instalación no pueden decir cosas distintas.
 */
export function unsupported(api: string): Error {
  const reason = findSurfaceEntry(api)?.entry.degradation
  return new Error(
    `[extension-host] \`${api}\` todavía no está soportado en Scrakk Studio. ` +
      (reason ?? 'El host cubre paneles de la activity bar, comandos y notificaciones.')
  )
}
