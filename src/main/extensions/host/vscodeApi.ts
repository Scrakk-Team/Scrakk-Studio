// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Construcción del módulo `vscode` que se le inyecta a la extensión.
 *
 * VS Code NO entrega `vscode` desde `node_modules`: lo provee el host. Aquí se
 * arma ese namespace apoyado en el `HostBridge` (transporte inyectable), así
 * que es testeable sin proceso, sin stdio y sin Electron.
 *
 * Reglas de esta capa:
 *  1. Lo que PUENTEAMOS es real (comandos → registry del IDE, notificaciones
 *     → registry del IDE, fs → jail del main). Nada de imitaciones.
 *  2. Lo que NO existe falla con `unsupported()` — un error claro y temprano,
 *     jamás un no-op que rompa a la extensión tres capas más allá.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Igual que `vscodeShim.ts`: este archivo no conoce Node, stdio ni Electron.
 * Habla `HostBridge` y nada más. Si Owear cambia el runtime, esto se conserva.
 */

import {
  CancellationError,
  Disposable,
  EventEmitter,
  FileStatImpl,
  Uri,
  WebviewViewHandle,
  unsupported,
  type VscodeShimOptions
} from './vscodeShim'
import { globToRegExp } from './globs'
import { VSCODE_API_VERSION } from '@shared/compatibility/apiVersion'
import {
  createExtensionContext,
  createPersistentMemento,
  createSecretStorage
} from './extensionContext'
import {
  TreeItem,
  TreeItemCollapsibleState,
  ThemeIcon,
  TreeViewRegistry,
  type TreeDataProviderLike,
  type TreeViewHandleLike,
  type TreeViewOptionsLike
} from './treeViews'
import {
  DocumentStore,
  Position,
  Range,
  Selection,
  TextLine,
  changeEvent,
  languageIdForPath,
  TextEditorImpl,
  type TextDocumentImpl
} from './textDocuments'
import { StatusBarRegistry } from './statusBar'
import { ViewColumn, WebviewPanelRegistry } from './webviewPanels'
import { DiagnosticsRegistry } from './diagnostics'
import { EditorDecorationsRegistry } from './editorDecorations'
import { LanguageProviderRegistry } from './languageProviders'
import * as enumValues from './enums'
import {
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  CodeAction,
  CodeLens,
  CompletionItem,
  CompletionList,
  Diagnostic,
  DiagnosticRelatedInformation,
  DocumentLink,
  DocumentSymbol,
  EvaluationResult,
  FoldingRange,
  Hover,
  InlayHint,
  Location,
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensEdit,
  SemanticTokensLegend,
  SelectionRange,
  SnippetString,
  SymbolInformation,
  TextEdit,
  TypeHierarchyItem,
  TypeHierarchyIncomingCall,
  TypeHierarchyOutgoingCall,
  WorkspaceEdit
} from './dataTypes'
import type {
  DocumentEvent,
  LanguageProviderKind,
  LogPayload,
  ProviderQueryParams,
  ProviderQueryResult,
  TreeNodeModel
} from '@shared/extensionHost/protocol'

// Inyectado por el build (`define` en build/electron-vite.base.ts).
declare const __APP_VERSION__: string

// ── Tipos del API que nos importan ────────────────────────────────────────

export interface WebviewLike {
  html: string
  options: Record<string, unknown>
  cspSource: string
  asWebviewUri(uri: Uri): Uri
  postMessage(message: unknown): Promise<boolean>
  onDidReceiveMessage(listener: (message: unknown) => void): Disposable
}

export interface WebviewViewLike {
  readonly viewType: string
  title: string
  webview: WebviewLike
  visible: boolean
  show(preserveFocus?: boolean): void
  onDidChangeVisibility(listener: (e: { visible: boolean }) => void): Disposable
  onDidDispose(listener: () => void): Disposable
}

export interface WebviewViewProviderLike {
  resolveWebviewView(
    webviewView: WebviewViewLike,
    context: { state: unknown },
    token: { isCancellationRequested: boolean }
  ): void | Promise<void>
}

/** Lo que la extensión exporta desde su `main` (entry). */
export interface ExtensionModule {
  activate?(context: unknown): unknown
  deactivate?(): unknown
}

/**
 * `TextDocumentContentProvider`: sirve el contenido de un documento VIRTUAL.
 *
 * Es como las extensiones muestran cosas que no existen en disco (`cline-diff:`, un
 * log, un diff, un archivo generado). Cline lo registra al activar, así que sin
 * esto su `activate()` moría con "registerTextDocumentContentProvider is not a
 * function".
 */
export interface TextDocumentContentProviderLike {
  provideTextDocumentContent(
    uri: Uri,
    token: { isCancellationRequested: boolean }
  ): string | Promise<string>
  onDidChange?(listener: (uri: Uri) => void): Disposable
}

export interface MementoLike {
  get<T>(key: string, defaultValue?: T): T | undefined
  update(key: string, value: unknown): Promise<void>
  keys(): readonly string[]
}

// ── Utilidades internas ───────────────────────────────────────────────────

/** Achata `contributes.configuration` a un mapa plano con sus defaults. */
export function flattenConfigurationDefaults(
  configuration: unknown
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!configuration) return out
  const sections = Array.isArray(configuration) ? configuration : [configuration]
  for (const section of sections) {
    if (!section || typeof section !== 'object') continue
    const properties = (section as { properties?: Record<string, unknown> }).properties
    if (!properties) continue
    for (const [key, definition] of Object.entries(properties)) {
      if (definition && typeof definition === 'object' && 'default' in definition) {
        out[key] = (definition as { default: unknown }).default
      }
    }
  }
  return out
}

/** Memento en memoria. v1 no persiste: la persistencia se enchufa aquí. */
export function createMemento(seed: Record<string, unknown> = {}): MementoLike {
  const store = new Map<string, unknown>(Object.entries(seed))
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      (store.has(key) ? (store.get(key) as T) : defaultValue),
    update: async (key: string, value: unknown): Promise<void> => {
      if (value === undefined) store.delete(key)
      else store.set(key, value)
    },
    keys: () => [...store.keys()]
  }
}

function noopEvent<T>(): (listener: (value: T) => void) => Disposable {
  return () => new Disposable(() => undefined)
}

/**
 * Evento REAL (con `fire`).
 *
 * Los eventos inertes alcanzan para que una extensión se suscriba sin
 * explotar, pero cuando el IDE SÍ sabe que algo cambió (el ajuste de
 * telemetría), avisar es la diferencia entre "el IDE dice la verdad" y "la
 * extensión se quedó con el valor del arranque". Un listener que tira no
 * tumba a los demás: el emisor de la extensión no es nuestro código.
 */
function createEventEmitter<T>(): {
  event: (listener: (value: T) => void) => Disposable
  fire: (value: T) => void
} {
  const listeners = new Set<(value: T) => void>()
  return {
    event: (listener) => {
      listeners.add(listener)
      return new Disposable(() => listeners.delete(listener))
    },
    fire: (value) => {
      for (const listener of [...listeners]) {
        try {
          listener(value)
        } catch {
          // Listener roto no corta el aviso a los demás.
        }
      }
    }
  }
}

/**
 * Sustituye los marcadores de `l10n.t`.
 *
 * Dos formas conviven en el API de VS Code:
 *   `t('Hola {0}', nombre)`            → posicionales
 *   `t('Hola {nombre}', { nombre })`   → nombrados
 * La sustitución se hace con los valores REALES (nunca se deja `{0}` en
 * pantalla: sería un mensaje roto, no una traducción faltante).
 */
export function substitutePlaceholders(message: string, values: unknown[]): string {
  let result = message
  values.forEach((value, index) => {
    result = result.split(`{${index}}`).join(String(value ?? ''))
  })
  const [only] = values
  if (values.length === 1 && only && typeof only === 'object') {
    for (const [key, value] of Object.entries(only as Record<string, unknown>)) {
      result = result.split(`{${key}}`).join(String(value ?? ''))
    }
  }
  return result
}

// ── Factory del API ───────────────────────────────────────────────────────

export interface VscodeApiBundle {
  api: Record<string, unknown>
  /** Comandos registrados por la extensión (para limpiar al desactivar). */
  registeredCommands(): string[]
  /** Providers de vistas webview registrados (`viewId` → provider). */
  viewProviders(): Map<string, WebviewViewProviderLike>
  /** Ids de las vistas de ÁRBOL registradas. */
  treeViewIds(): string[]
  /**
   * Refleja un hecho del editor (documento abierto/cambiado/guardado/cerrado,
   * activo). El proceso host lo llama cuando el main avisa.
   */
  applyDocumentEvent(event: DocumentEvent): void
  /**
   * El usuario cambió el ajuste de telemetría: actualiza `env` y dispara
   * `onDidChangeTelemetryEnabled`.
   */
  setTelemetryEnabled(enabled: boolean): void
  /** Estado inicial de documentos (viene en `init`, ver hostManager). */
  seedDocuments(events: DocumentEvent[]): void
  /** Entrega un mensaje del iframe a un PANEL de webview (no vista). */
  deliverPanelMessage(id: string, message: unknown): void
  /**
   * Resuelve una vista y dice DE QUÉ TIPO es: `webview` (publica HTML) o
   * `tree` (sirve nodos). El renderer no adivina: pregunta aquí.
   */
  resolveView(viewId: string, initialTitle: string): Promise<'webview' | 'tree'>
  /** Hijos de un nodo del árbol (`null` = raíz). */
  treeChildren(viewId: string, elementId: string | null): Promise<TreeNodeModel[]>
  /** Click en un nodo: corre el comando del item con sus argumentos REALES. */
  treeSelect(viewId: string, elementId: string): Promise<{ ran: boolean; command?: string }>
  /** Entrega al provider el mensaje que llegó del iframe. */
  deliverViewMessage(viewId: string, message: unknown): void
  /** Esquemas con `TextDocumentContentProvider` registrado (diagnóstico). */
  contentProviderSchemes(): string[]
  /** Dispone la vista (el panel se cerró / cambió el layout). */
  disposeView(viewId: string): void
  /** Dispone un panel del editor (el usuario cerró su tab). */
  disposePanel(id: string): void
  /** Ejecuta un comando LOCAL (registrado por la extensión). */
  executeLocalCommand(id: string, args: unknown[]): Promise<unknown>
  /**
   * Consulta un proveedor de lenguaje registrado por la extensión
   * (hover, definición, referencias, formateo…). El IDE pregunta por aquí:
   * es lo que hace que el LSP de una extensión se vea en el editor.
   */
  queryProvider(params: ProviderQueryParams): Promise<ProviderQueryResult>
  /**
   * Corre un comando como si la extensión lo pidiera (`vscode.commands.executeCommand`):
   * primero sus comandos locales y, si no es suyo, el registry del IDE
   * (built-ins de VS Code incluidos).
   *
   * Es distinto de `executeLocalCommand` a propósito: cuando la UI pide un
   * comando (el botón de un `viewsWelcome`, un nodo de árbol) puede ser un
   * built-in del entorno (`workbench.action.openSettings`, por ejemplo) y el
   * host no es el dueño de esos ids.
   */
  executeCommand(id: string, args: unknown[]): Promise<unknown>
  /** Corre `activate(context)`. */
  activate(extensionModule: ExtensionModule): Promise<void>
  /** Corre `deactivate()` y dispone todo. */
  deactivate(extensionModule: ExtensionModule): Promise<void>
}

/**
 * Construye el módulo `vscode` completo.
 *
 * `options.bridge` es lo único que sabe hablar con el mundo; el resto es
 * estado local del host.
 */
/**
 * Entrada de un `DocumentSelector`: un language id suelto, o un filtro con
 * `language` / `scheme` / `pattern` (glob).
 */
export type DocumentSelectorEntry = string | { language?: string; scheme?: string; pattern?: string }
export type DocumentSelectorLike = DocumentSelectorEntry | DocumentSelectorEntry[] | null | undefined

/** Lo mínimo que hay que saber de un documento para matchearlo. */
export interface MatchableDocument {
  languageId?: string
  fileName?: string
  uri?: { scheme?: string; path?: string; fsPath?: string; toString(): string }
}

/**
 * `languages.match` — la regla de VS Code: gana la entrada con MÁS criterios
 * cumplidos, y `0` significa "no matchea".
 *
 * La lib del protocolo pregunta con `> 0` (`features.js` de
 * `vscode-languageclient`): por eso "matchea sin criterios" (`{}`) devuelve 1
 * y no 0 — un selector vacío matchea todo, y devolver 0 le diría al server que
 * no le corresponde ningún archivo.
 */
export function matchDocumentSelector(
  selector: DocumentSelectorLike,
  document: MatchableDocument | null | undefined
): number {
  if (!selector || !document) return 0
  const entries = Array.isArray(selector) ? selector : [selector]
  let best = 0
  for (const entry of entries) {
    const score = scoreDocumentSelectorEntry(entry, document)
    if (score > best) best = score
  }
  return best
}

function scoreDocumentSelectorEntry(
  entry: DocumentSelectorEntry,
  document: MatchableDocument
): number {
  if (typeof entry === 'string') {
    if (entry === '*') return 1
    return document.languageId === entry ? 1 : 0
  }
  if (!entry || typeof entry !== 'object') return 0

  let score = 0
  if (entry.language !== undefined) {
    if (entry.language !== '*' && document.languageId !== entry.language) return 0
    score += 1
  }
  if (entry.scheme !== undefined) {
    // Un documento sin URI es un archivo (el caso normal).
    const scheme = document.uri?.scheme ?? 'file'
    if (entry.scheme !== '*' && scheme !== entry.scheme) return 0
    score += 1
  }
  if (entry.pattern !== undefined) {
    if (!matchesDocumentPattern(entry.pattern, document)) return 0
    score += 1
  }
  return score === 0 ? 1 : score
}

function matchesDocumentPattern(pattern: string, document: MatchableDocument): boolean {
  const candidate = document.fileName ?? document.uri?.fsPath ?? document.uri?.path ?? ''
  const normalized = candidate.replace(/\\/g, '/')
  // Glob sin `/` = sobre el NOMBRE del archivo (`*.ts`), como en VS Code.
  if (!pattern.includes('/')) {
    const name = normalized.slice(normalized.lastIndexOf('/') + 1)
    return globToRegExp(pattern).test(name)
  }
  // Con `/` el glob se compara contra la RUTA. Se acepta escrita relativa al
  // workspace (`src/*.ts`) porque es así como la escriben las extensiones: el
  // archivo real llega con el prefijo absoluto y un glob relativo no matchearía
  // nunca contra `/home/…/src/a.ts`.
  if (globToRegExp(pattern).test(normalized)) return true
  return pattern.startsWith('**') ? false : globToRegExp(`**/${pattern}`).test(normalized)
}

export function createVscodeApi(options: VscodeShimOptions): VscodeApiBundle {
  const { bridge, extensionPath, extensionId } = options

  const commands = new Map<string, (...args: unknown[]) => unknown>()
  const viewProviders = new Map<string, WebviewViewProviderLike>()
  const openViews = new Map<string, WebviewViewHandle>()
  /** Handler de URIs entrantes (lo registra `registerUriHandler`). */
  let uriHandler: { handleUri(uri: Uri): unknown } | undefined
  // Los árboles viven en su propio registro (serialización + elementos
  // originales en memoria; ver treeViews.ts).
  const trees = new TreeViewRegistry({ bridge, extensionPath })

  const subscriptions: Disposable[] = []

  /**
   * Aviso UNA vez por API por host: las extensiones que activan contra una
   * parte del API que todavía es inerte lo dicen en el log, y el log no se
   * inunda con el mismo mensaje en cada llamada.
   */
  const warned = new Set<string>()
  function warnOnce(key: string, message: string): void {
    if (warned.has(key)) return
    warned.add(key)
    bridge.log('warn', `[${extensionId}] ${message}`)
  }

  // ── Documentos del editor (REALES: los manda el IDE) ───────────────────
  // Ver `textDocuments.ts`: el renderer empuja el buffer de cada archivo
  // abierto y aquí se materializa un `TextDocument` de verdad. Es lo que hace
  // que una extensión que mira el archivo abierto (Comment Anchors, un
  // contador, un linter) tenga algo que mirar.
  const documentEvents = {
    open: new EventEmitter<{ document: TextDocumentImpl }>(),
    change: new EventEmitter<ReturnType<typeof changeEvent>>(),
    close: new EventEmitter<{ document: TextDocumentImpl }>(),
    save: new EventEmitter<{ document: TextDocumentImpl }>(),
    active: new EventEmitter<TextEditorImpl | undefined>(),
    visible: new EventEmitter<TextEditorImpl[]>(),
    selection: new EventEmitter<{ textEditor: TextEditorImpl; selections: Selection[] }>()
  }

  const documents = new DocumentStore(
    { writeFile: (path, content) => bridge.writeFile(path, content) },
    {
      onOpen: (document) => {
        documentEvents.open.fire({ document })
        documentEvents.visible.fire(documents.editors)
      },
      onChange: (document) => documentEvents.change.fire(changeEvent(document)),
      onClose: (document) => {
        documentEvents.close.fire({ document })
        documentEvents.visible.fire(documents.editors)
      },
      onSave: (document) => documentEvents.save.fire({ document }),
      // `editor.setDecorations`: el editor sólo dice archivo + tipo + rangos.
      onSetDecorations: (path, type, ranges) => decorations.setDecorations(path, type, ranges),
      onActive: () => {
        const editor = documents.activeEditor
        documentEvents.active.fire(editor)
        if (editor) documentEvents.selection.fire({ textEditor: editor, selections: editor.selections })
      },
      log: (level, message) => bridge.log(level, `[${extensionId}] ${message}`)
    }
  )

  // ── Diagnósticos (REALES: viajan a la UI y se pintan) ──────────────────
  // Cada cambio en una colección se empuja al main con los archivos TOCADOS
  // (incluidos los que quedaron sin problemas: ese `[]` es lo que borra el
  // error viejo de la lista). El panel de Problemas y el chip de la barra de
  // estado viven de esto.
  const diagnostics = new DiagnosticsRegistry()
  diagnostics.onDidChangeDiagnostics.event(({ uris }) =>
    bridge.pushDiagnostics({ entries: diagnostics.snapshot(uris) })
  )

  // ── Decoraciones de editor (REALES: viajan a la UI y se pintan) ────────
  // `window.createTextEditorDecorationType` + `editor.setDecorations`: la
  // extensión pinta rangos DENTRO del texto. Antes esto era inerte (avisaba
  // una vez y devolvía un objeto vacío); ahora el tipo se parsea, los rangos
  // se guardan por archivo y cada cambio se empuja al IDE.
  const decorations = new EditorDecorationsRegistry((payload) => bridge.pushDecorations(payload))

  // ── Barra de estado (REAL: la pinta el IDE) ────────────────────────────
  const statusBar = new StatusBarRegistry(extensionId, {
    pushStatusItem: (item) => bridge.pushStatusItem(item),
    log: (level, message) => bridge.log(level, `[${extensionId}] ${message}`)
  })

  // ── Paneles de webview del editor (REALES) ─────────────────────────────
  const panels = new WebviewPanelRegistry(extensionId, {
    pushPanel: (model) => bridge.pushPanel(model),
    pushPanelHtml: (id, html) => bridge.pushPanelHtml(id, html),
    pushPanelMessage: (id, message) => bridge.pushPanelMessage(id, message),
    pushPanelClose: (id) => bridge.pushPanelClose(id),
    asWebviewUri: (absolutePath) => bridge.asWebviewUri(absolutePath),
    log: (level, message) => bridge.log(level, `[${extensionId}] ${message}`)
  })

  // ── commands ────────────────────────────────────────────────────────────
  const commandsApi = {
    registerCommand(id: string, callback: (...args: unknown[]) => unknown): Disposable {
      if (commands.has(id)) {
        // VS Code devuelve un Disposable que no reemplaza; replicamos el
        // comportamiento y avisamos, porque suele indicar un bug de la ext.
        bridge.log('warn', `el comando "${id}" ya estaba registrado; se reemplaza`)
      }
      commands.set(id, callback)
      bridge.reportCommand(id, true)
      return new Disposable(() => {
        if (commands.get(id) === callback) {
          commands.delete(id)
          bridge.reportCommand(id, false)
        }
      })
    },

    async executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
      const local = commands.get(id)
      if (local) return await local(...args)
      // No es nuestro: lo resuelve el registry del IDE (comandos built-in u
      // otra extensión). El main es quien rutea.
      return await bridge.executeCommand(id, args)
    },

    async getCommands(): Promise<string[]> {
      return [...commands.keys()]
    },

    /**
     * Comando con el editor activo como primer argumento. Se registra como un
     * comando normal y el editor se resuelve al EJECUTARLO (VS Code hace lo
     * mismo): si no hay editor activo, el callback no corre.
     */
    registerTextEditorCommand(
      id: string,
      callback: (
        editor: TextEditorImpl,
        edit: (builder: unknown) => void,
        ...args: unknown[]
      ) => unknown
    ): Disposable {
      return commandsApi.registerCommand(id, async (...args: unknown[]) => {
        const editor = documents.activeEditor
        if (!editor) return undefined
        return await callback(
          editor,
          () => {
            // Honesto: aplicar ediciones al buffer necesita el canal de vuelta
            // (host → editor) que todavía no existe.
            throw unsupported('textEditor.edit')
          },
          ...args
        )
      })
    }
  }

  // ── window ──────────────────────────────────────────────────────────────

  /**
   * Botón de un mensaje. VS Code acepta strings O `MessageItem` (el que trae
   * `isCloseAffordance` para el botón de cancelar).
   */
  interface MessageItemLike {
    title: string
    isCloseAffordance?: boolean
  }

  /** Opciones del mensaje (`MessageOptions`): `modal` y `detail`. */
  interface MessageOptionsLike {
    modal?: boolean
    detail?: string
  }

  function isMessageItem(value: unknown): value is MessageItemLike {
    return (
      Boolean(value) &&
      typeof value === 'object' &&
      typeof (value as MessageItemLike).title === 'string'
    )
  }

  /**
   * ¿El primer extra es `MessageOptions` y no un botón?
   *
   * Se distingue por la FORMA (un botón siempre tiene `title`), que es la
   * única información disponible: en JS no hay sobrecargas.
   */
  function isMessageOptions(value: unknown): value is MessageOptionsLike {
    return Boolean(value) && typeof value === 'object' && !isMessageItem(value)
  }

  /** Título de un botón, sea string o `MessageItem`. */
  function labelOf(item: unknown): string {
    if (typeof item === 'string') return item
    if (isMessageItem(item)) return item.title
    return ''
  }

  /**
   * `window.show{Information,Warning,Error}Message`.
   *
   * Firma REAL de VS Code: `(message, options?, ...items)`. Los `items` son las
   * etiquetas de los botones y se devuelve EL ITEM ELEGIDO (no el índice), o
   * `undefined` si se cerró sin elegir o si lo elegido es un botón de cierre.
   *
   * Lo que viaja al renderer son STRINGS: un `MessageItem`/`MessageOptions` no
   * cruza el IPC, y por eso se normaliza Aquí (el bug de Cline fue exactamente
   * no hacerlo: un `{modal, detail}` renderizado como texto del botón).
   */
  async function showMessage(
    severity: 'info' | 'warning' | 'error',
    message: string,
    rest: unknown[]
  ): Promise<unknown> {
    const hasOptions = rest.length > 0 && isMessageOptions(rest[0])
    const options = hasOptions ? (rest[0] as MessageOptionsLike) : undefined
    const items = hasOptions ? rest.slice(1) : rest

    // Botones con etiqueta: los que no tienen texto no son botones.
    const buttons = items
      .map((item) => ({ item, label: labelOf(item) }))
      .filter((entry) => entry.label.length > 0)

    const chosen = await bridge.showNotification({
      title: extensionId,
      message: String(message ?? ''),
      severity,
      detail: typeof options?.detail === 'string' ? options.detail : undefined,
      modal: options?.modal === true,
      // El API público de la app sostiene 3 botones (ver NotificationRegistry).
      actions: buttons.length > 0 ? buttons.slice(0, 3).map((button) => button.label) : undefined
    })
    if (typeof chosen !== 'number') return undefined
    const selected = buttons[chosen]?.item
    // Un botón de cierre equivale a "no eligió nada" (así lo trata VS Code).
    if (isMessageItem(selected) && selected.isCloseAffordance) return undefined
    return selected
  }

  /**
   * Espera a que el IDE abra el documento de esa ruta (el snapshot llega por
   * `doc/open`). Sin esto, `showTextDocument` devolvería `undefined` por una
   * carrera de milisegundos, que es la peor clase de bug para una extensión.
   */
  function waitForDocument(path: string, timeoutMs = 3000): Promise<TextDocumentImpl | undefined> {
    const existing = documents.get(path)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve) => {
      let dispose: (() => void) | null = null
      const timer = setTimeout(() => {
        dispose?.()
        resolve(undefined)
      }, timeoutMs)
      const subscription = documentEvents.open.event(({ document }) => {
        if (document.fileName !== path) return
        clearTimeout(timer)
        subscription.dispose()
        resolve(document)
      })
      dispose = () => subscription.dispose()
    })
  }

  /**
   * El documento de una ruta, abriéndolo si hace falta (lo usa
   * `provider/query`).
   *
   * Un proveedor de lenguaje recibe un `TextDocument`, no una ruta: si el
   * archivo no está abierto en el editor (el caso típico de "ir a la
   * definición" hacia otro archivo), se lee del disco y se materializa en
   * `workspace.textDocuments` — que es exactamente lo que hace el editor de VS
   * Code cuando el server pide un documento y no está abierto.
   */
  async function ensureDocument(path: string): Promise<TextDocumentImpl | undefined> {
    const open = documents.get(path)
    if (open) return open
    try {
      const result = await bridge.readFile(path)
      if (!result.success) return undefined
      return documents.openExternal(path, result.value ?? '', languageIdForPath(path), 1)
    } catch (error) {
      bridge.log(
        'warn',
        `no se pudo abrir ${path} para un proveedor de lenguaje: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      return undefined
    }
  }

  // ── Documentos virtuales (contenido que sirve la propia extensión) ──────
  /** `scheme` → provider (los registra `registerTextDocumentContentProvider`). */
  const contentProviders = new Map<string, TextDocumentContentProviderLike>()

  /**
   * Clave de un documento: ruta en disco para `file:`, URI COMPLETA para un
   * esquema virtual (dos esquemas distintos pueden tener la misma ruta).
   */
  function documentKey(uri: Uri): string {
    return uri.scheme === 'file' ? uri.fsPath : uri.toString()
  }

  /**
   * Pide el contenido al provider del esquema y lo materializa como documento
   * REAL en `workspace.textDocuments` (con su lenguaje, versión y eventos).
   */
  async function provideVirtualDocument(uri: Uri): Promise<TextDocumentImpl> {
    const provider = contentProviders.get(uri.scheme)
    if (!provider) {
      throw new Error(
        `no hay ningún TextDocumentContentProvider para el esquema "${uri.scheme}" ` +
          `(${uri.toString()})`
      )
    }
    const content = await provider.provideTextDocumentContent(uri, {
      isCancellationRequested: false
    })
    const key = documentKey(uri)
    const text = String(content ?? '')
    const existing = documents.get(key)
    if (existing) {
      documents.refreshExternal(key, text)
      return existing
    }
    return documents.openExternal(key, text, languageIdForPath(uri.path), 1, uri)
  }

  /** ¿Es un documento/URI de un esquema virtual (no `file`)? */
  function virtualUriOf(value: unknown): Uri | null {
    if (value instanceof Uri) return value.scheme === 'file' ? null : value
    const candidate = value as { uri?: unknown } | null
    if (candidate?.uri instanceof Uri && candidate.uri.scheme !== 'file') return candidate.uri
    if (typeof value === 'string') {
      const parsed = Uri.parse(value)
      return parsed.scheme === 'file' ? null : parsed
    }
    return null
  }

  /** Ruta de un `TextDocument`, `Uri` o string (el API acepta los tres). */
  function documentPath(value: unknown): string | null {
    if (!value) return null
    if (typeof value === 'string') return value
    if (value instanceof Uri) return value.fsPath
    const candidate = value as { uri?: unknown; fileName?: unknown }
    if (candidate.uri instanceof Uri) return candidate.uri.fsPath
    if (typeof candidate.fileName === 'string') return candidate.fileName
    return null
  }

  function resolveView(viewId: string, initialTitle: string): WebviewViewHandle {
    const existing = openViews.get(viewId)
    if (existing) return existing
    const handle = new WebviewViewHandle(viewId, initialTitle, options)
    openViews.set(viewId, handle)
    return handle
  }

  const windowApi = {
    showInformationMessage: (message: string, ...rest: unknown[]) =>
      showMessage('info', message, rest),
    showWarningMessage: (message: string, ...rest: unknown[]) =>
      showMessage('warning', message, rest),
    showErrorMessage: (message: string, ...rest: unknown[]) =>
      showMessage('error', message, rest),

    /**
     * Maneja URIs entrantes (`vscode://…`). Se registra de verdad y se avisa:
     * sin esto, una extensión que lo llama al activar recibía un
     * "is not a function" y su `activate` moría.
     */
    registerUriHandler(handler: { handleUri(uri: Uri): unknown }): Disposable {
      uriHandler = handler
      return new Disposable(() => {
        if (uriHandler === handler) uriHandler = undefined
      })
    },

    /**
     * Grupos de tabs del editor. El IDE todavía no expone su árbol de tabs, así
     * que se entrega un grupo vacío (una extensión que lo recorra ve "0 tabs",
     * que es honesto) en vez de `undefined` — que reventaba con
     * "Cannot read properties of undefined".
     */
    tabGroups: {
      all: [] as unknown[],
      activeTabGroup: undefined as unknown,
      close: async (): Promise<boolean> => false,
      onDidChangeTabs: noopEvent<unknown>(),
      onDidChangeTabGroups: noopEvent<unknown>()
    },

    registerWebviewViewProvider(
      viewId: string,
      provider: WebviewViewProviderLike,
      _webviewOptions?: { retainContextWhenHidden?: boolean }
    ): Disposable {
      viewProviders.set(viewId, provider)
      bridge.log('info', `vista webview registrada: ${viewId}`)
      return new Disposable(() => {
        if (viewProviders.get(viewId) === provider) viewProviders.delete(viewId)
      })
    },

    /** Paneles de ÁRBOL: la otra mitad de los paneles de la activity bar. */
    registerTreeDataProvider(viewId: string, provider: TreeDataProviderLike): Disposable {
      return trees.register(viewId, provider)
    },

    createTreeView(viewId: string, viewOptions: TreeViewOptionsLike): TreeViewHandleLike {
      return trees.create(viewId, viewOptions)
    },

    /**
     * Canal de salida. REAL, pero sin panel propio: lo que la extensión
     * escribe va al log del IDE con el nombre del canal. Es preferible eso a
     * tirar el error y dejar la extensión sin activar.
     *
     * Con `{ log: true }` VS Code devuelve un `LogOutputChannel`, que además
     * tiene `trace/debug/info/warn/error` y un `logLevel` editable. Faltaban y
     * una extensión que loguea con `.debug()` moría con "is not a function".
     */
    createOutputChannel(name: string, options?: { log?: boolean }) {
      let visible = false
      let level = 1
      const write = (severity: LogPayload['level'], value: string): void =>
        bridge.log(severity, `[${name}] ${String(value ?? '')}`)
      const channel = {
        name,
        get logLevel() {
          return level
        },
        set logLevel(next: number) {
          if (typeof next === 'number') level = next
        },
        onDidChangeLogLevel: noopEvent<number>(),
        trace(value: string) {
          if (level <= 1) write('info', value)
        },
        debug(value: string) {
          if (level <= 2) write('info', value)
        },
        info(value: string) {
          if (level <= 3) write('info', value)
        },
        warn(value: string) {
          write('warn', value)
        },
        error(value: unknown) {
          write('error', value instanceof Error ? value.message : String(value ?? ''))
        },
        append(value: string) {
          write('info', value)
        },
        appendLine(value: string) {
          write('info', value)
        },
        replace(value: string) {
          write('info', value)
        },
        clear() {},
        show() {
          visible = true
        },
        hide() {
          visible = false
        },
        get visible() {
          return visible
        },
        /** El modo `log` de VS Code: `dispose()` no rompe nada si no se usó. */
        dispose() {
          void options
        }
      }
      return channel
    },

    /**
     * Item de barra de estado REAL: el IDE lo dibuja y el click corre su
     * comando por el registry de la app (no un no-op).
     */
    createStatusBarItem(alignment?: unknown, priority?: unknown, id?: string): unknown {
      return statusBar.create(alignment, priority, id)
    },

    /** Mensaje TEMPORAL en la barra (se va solo con el timeout o la promesa). */
    setStatusBarMessage(text: string, hideAfterTimeoutOrThenable?: unknown): Disposable {
      return statusBar.setMessage(String(text ?? ''), hideAfterTimeoutOrThenable)
    },

    /**
     * Tipo de decoración REAL: `editor.setDecorations(tipo, rangos)` lo pinta
     * el IDE (subrayado ondulado/recto/punteado/doble, con el color que pida
     * la extensión). El estado vive en el registro del host y viaja a la UI en
     * cada cambio; `dispose()` borra sus rangos.
     */
    createTextEditorDecorationType(options?: Record<string, unknown>) {
      return decorations.createType(options)
    },

    /** Watchers de archivos: inertes (no llegan eventos del workspace aún). */
    createFileSystemWatcher(glob?: unknown) {
      warnOnce('watchers', 'los watchers de archivos todavía no reciben eventos.')
      return {
        globPattern: glob,
        ignoreCreateEvents: false,
        ignoreChangeEvents: false,
        ignoreDeleteEvents: false,
        onDidCreate: noopEvent<unknown>(),
        onDidChange: noopEvent<unknown>(),
        onDidDelete: noopEvent<unknown>(),
        dispose() {}
      }
    },

    /**
     * Colección de diagnósticos REAL: guarda lo que la extensión publica,
     * dispara `onDidChangeDiagnostics` y lo empuja a la UI, que lo pinta en el
     * panel de Problemas (y en el chip de la barra de estado con los conteos).
     */
    createDiagnosticCollection(name?: string) {
      return diagnostics.createCollection(name ?? extensionId)
    },

    /** Panel de webview en el ÁREA DEL EDITOR (una tab de verdad). */
    createWebviewPanel(
      viewType: string,
      title: string,
      showOptions?: unknown,
      options?: Record<string, unknown>
    ): unknown {
      const column =
        typeof showOptions === 'number'
          ? showOptions
          : ((showOptions as { viewColumn?: number } | undefined)?.viewColumn ?? ViewColumn.One)
      return panels.create(viewType, title, column, {
        enableScripts: (options?.enableScripts as boolean | undefined) ?? true,
        retainContextWhenHidden: (options?.retainContextWhenHidden as boolean | undefined) ?? false
      })
    },
    showQuickPick(): never {
      throw unsupported('window.showQuickPick')
    },
    showInputBox(): never {
      throw unsupported('window.showInputBox')
    },
    /**
     * Abre un archivo en el EDITOR del IDE. La tab la abre la UI
     * (`editor/open`), así el archivo queda abierto de verdad y no en un
     * editor paralelo que nadie ve.
     */
    async showTextDocument(documentOrUri: unknown, _options?: unknown): Promise<TextEditorImpl | undefined> {
      // Documento VIRTUAL: no hay archivo que abrir. Se entrega el editor del
      // documento REAL que la extensión proveyó y se avisa (una vez) que el IDE
      // todavía no lo pinta como tab — mentir con una tab que no existe sería peor.
      const virtualUri = virtualUriOf(documentOrUri)
      if (virtualUri) {
        warnOnce(
          `virtual:${virtualUri.scheme}`,
          `los documentos virtuales (esquema "${virtualUri.scheme}") todavía no se muestran como tab en el editor.`
        )
        const document = await provideVirtualDocument(virtualUri)
        return document ? new TextEditorImpl(document) : undefined
      }
      const path = documentPath(documentOrUri)
      if (!path) throw new Error('showTextDocument necesita un documento o Uri')
      const result = await bridge.openInEditor(path)
      if (!result.success) throw new Error(result.error ?? `no se pudo abrir ${path}`)
      // El snapshot del documento llega por el canal de documentos (lo manda
      // la UI al abrir la tab): se espera un momento en vez de devolver un
      // editor inventado. Si no llega, se devuelve undefined como VS Code
      // cuando el archivo no se pudo mostrar.
      const document = await waitForDocument(path)
      return document ? new TextEditorImpl(document) : undefined
    },
    withProgress(_options: unknown, task: () => unknown): unknown {
      // Sin UI de progreso propia: la tarea corre igual. No se finge progreso.
      return task()
    },

    onDidChangeActiveColorTheme: noopEvent<unknown>(),

    /** Editor activo REAL (el documento que el IDE tiene adelante). */
    get activeTextEditor(): TextEditorImpl | undefined {
      return documents.activeEditor
    },
    get visibleTextEditors(): TextEditorImpl[] {
      return documents.editors
    },
    onDidChangeActiveTextEditor: (listener: (editor: TextEditorImpl | undefined) => void) =>
      documentEvents.active.event(listener),
    onDidChangeVisibleTextEditors: (listener: (editors: TextEditorImpl[]) => void) =>
      documentEvents.visible.event(listener),
    onDidChangeTextEditorSelection: (
      listener: (event: { textEditor: TextEditorImpl; selections: Selection[] }) => void
    ) => documentEvents.selection.event(listener),
    onDidChangeTextEditorVisibleRanges: noopEvent<unknown>(),
    onDidChangeWindowState: noopEvent<unknown>()
  }

  /**
   * Proveedores de lenguaje: los que el IDE CONSULTA se registran de verdad
   * (ver `languageProviders.ts`); los que todavía no tienen UI avisan una vez.
   *
   * Los inertes no son un detalle: una extensión los registra en
   * `activate()` y sin el método la activación muere con "is not a function"
   * (y con eso el panel ni aparece).
   */
  const languageProviders = new LanguageProviderRegistry({
    match: matchDocumentSelector,
    log: (level, message) => bridge.log(level, `[${extensionId}] ${message}`)
  })

  /**
   * Registrar un proveedor que el editor todavía no consulta.
   *
   * El mensaje dice CUÁL queda inerte (no un genérico): el log del host es
   * donde el usuario mira cuando "la extensión dice que hace hover y no pasa
   * nada".
   */
  function inertProvider(name: string): () => Disposable {
    return () => {
      warnOnce(
        `provider:${name}`,
        `se registró ${name}(), pero el editor todavía no consulta ese proveedor (no hay UI para él).`
      )
      return new Disposable(() => undefined)
    }
  }

  /** Registro REAL de un proveedor consultable. */
  function activeProvider(kind: LanguageProviderKind): (selector: unknown, provider: unknown) => Disposable {
    return (selector: unknown, provider: unknown): Disposable =>
      languageProviders.register(kind, selector as DocumentSelectorLike, provider)
  }

  const languagesApi: Record<string, unknown> = {
    registerDocumentLinkProvider: inertProvider('registerDocumentLinkProvider'),
    // ── Consultables HOY (el IDE pregunta por `provider/query`) ────────────
    registerHoverProvider: activeProvider('hover'),
    registerDefinitionProvider: activeProvider('definition'),
    registerDeclarationProvider: activeProvider('declaration'),
    registerImplementationProvider: activeProvider('implementation'),
    registerTypeDefinitionProvider: activeProvider('typeDefinition'),
    registerReferenceProvider: activeProvider('references'),
    registerDocumentHighlightProvider: activeProvider('documentHighlight'),
    registerDocumentFormattingEditProvider: activeProvider('formatting'),
    registerDocumentRangeFormattingEditProvider: activeProvider('rangeFormatting'),
    // ── Registrables pero sin UI todavía ──────────────────────────────────
    registerCompletionItemProvider: inertProvider('registerCompletionItemProvider'),
    registerRenameProvider: inertProvider('registerRenameProvider'),
    registerSignatureHelpProvider: inertProvider('registerSignatureHelpProvider'),
    registerDocumentSymbolProvider: inertProvider('registerDocumentSymbolProvider'),
    registerWorkspaceSymbolProvider: inertProvider('registerWorkspaceSymbolProvider'),
    registerCodeActionsProvider: inertProvider('registerCodeActionsProvider'),
    registerCodeLensProvider: inertProvider('registerCodeLensProvider'),
    registerFoldingRangeProvider: inertProvider('registerFoldingRangeProvider'),
    registerSelectionRangeProvider: inertProvider('registerSelectionRangeProvider'),
    registerSemanticTokensProvider: inertProvider('registerSemanticTokensProvider'),
    registerInlayHintsProvider: inertProvider('registerInlayHintsProvider'),
    registerCallHierarchyProvider: inertProvider('registerCallHierarchyProvider'),
    registerTypeHierarchyProvider: inertProvider('registerTypeHierarchyProvider'),
    createDiagnosticCollection: (name?: string) => windowApi.createDiagnosticCollection(name),
    setLanguageConfiguration: inertProvider('setLanguageConfiguration'),
    getLanguages: () => [] as string[],
    /**
     * `languages.match` REAL.
     *
     * La lib del protocolo (`vscode-languageclient`) decide con ESTO si un
     * documento entra en el `documentSelector` del server: con el stub que
     * devolvía `null` ningún documento matcheaba nunca y el server se quedaba
     * sin `didOpen` (el LSP arrancaba y jamás veía un archivo).
     */
    match: (selector: unknown, document: unknown) =>
      matchDocumentSelector(selector as DocumentSelectorLike, document as MatchableDocument),
    /** Diagnósticos publicados por la extensión (real: ver `diagnostics.ts`). */
    getDiagnostics: (uri?: Uri): unknown => {
      if (!uri) {
        return diagnostics.all().map(([resource, list]) => ({ uri: resource, diagnostics: list }))
      }
      return diagnostics.get(uri)
    },
    onDidChangeDiagnostics: (listener: (e: { uris: readonly Uri[] }) => void) =>
      diagnostics.onDidChangeDiagnostics.event(listener)
  }

  // ── workspace ───────────────────────────────────────────────────────────
  // El shim está en el borde con el bridge inyectado: si devuelve algo raro,
  // el API se degrada a "sin workspace" en vez de reventarle a la extensión.
  const roots = bridge.workspaceRoots() ?? []
  const configurationDefaults = options.configurationDefaults ?? {}

  // `configurationDefaults` llega YA aplanado desde el main (que es quien
  // leyó el manifest); aquí no se vuelve a interpretar `contributes`.
  /**
   * Ajustes: defaults del manifest PISADOS por lo que la extensión ya persistió
   * (`configurationValues`, que el main leyó). Es un mapa de clave plana
   * (`demo.mode`) porque el main ya aplanó `contributes.configuration`.
   */
  const configurationValues: Record<string, unknown> = {
    ...configurationDefaults,
    ...(options.configurationValues ?? {})
  }

  function configurationFor(section?: string): {
    get<T>(key: string, defaultValue?: T): T | undefined
    has(key: string): boolean
    inspect(key: string): { key: string; defaultValue?: unknown } | undefined
    update(key: string, value: unknown, target?: number): Promise<void>
  } {
    const prefix = section ? `${section}.` : ''
    /**
     * Clave resuelta. VS Code usa `section.key`; además probamos la clave CRUDA
     * porque hay extensiones que pasan la clave completa teniendo sección
     * (`getConfiguration('demo').get('demo.mode')`). Probar las dos nunca puede
     * devolver un valor equivocado — es la clave que la extensión pidió.
     */
    const resolve = (key: string): string | null => {
      const full = `${prefix}${key}`
      if (full in configurationValues) return full
      return key in configurationValues ? key : null
    }
    return {
      get<T>(key: string, defaultValue?: T): T | undefined {
        const found = resolve(key)
        return found === null ? defaultValue : (configurationValues[found] as T)
      },
      has(key: string): boolean {
        return resolve(key) !== null
      },
      inspect(key: string) {
        const found = resolve(key)
        return found === null ? undefined : { key, defaultValue: configurationValues[found] }
      },
      /**
       * Persiste el ajuste (lo guarda el main, junto al resto de los ajustes
       * del Extension Host). El propio `get` ya lo ve al volver.
       */
      async update(key: string, value: unknown, target?: number): Promise<void> {
        const full = `${prefix}${key}`
        const result = await bridge.writeConfiguration(full, value, target)
        if (!result.success) {
          throw new Error(result.error ?? `no se pudo guardar el ajuste "${full}"`)
        }
        if (value === undefined) delete configurationValues[full]
        else configurationValues[full] = value
      }
    }
  }

  const workspaceApi = {
    get workspaceFolders() {
      if (roots.length === 0) return undefined
      return roots.map((root, index) => ({
        uri: Uri.file(root),
        name: root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? root,
        index
      }))
    },
    get rootPath(): string | undefined {
      return roots[0]
    },
    getWorkspaceFolder(uri: Uri) {
      const target = uri.fsPath
      const index = roots.findIndex((root) => target.startsWith(root))
      if (index < 0) return undefined
      return {
        uri: Uri.file(roots[index]),
        name: roots[index].split(/[\\/]/).pop() ?? roots[index],
        index
      }
    },
    asRelativePath(pathOrUri: Uri | string): string {
      const target = typeof pathOrUri === 'string' ? pathOrUri : pathOrUri.fsPath
      for (const root of roots) {
        if (target.startsWith(root)) return target.slice(root.length).replace(/^[\\/]+/, '')
      }
      return target
    },
    /**
     * FS delegado: el JAIL y los permisos se aplican en el proceso main.
     *
     * El API completo (stat, readDirectory, createDirectory, delete, rename,
     * copy) porque las extensiones reales usan `workspace.fs` como su capa de
     * disco: implementar sólo readFile/writeFile hacía que un `stat()` fuera
     * "undefined is not a function" en medio de su arranque (medido: Cline
     * llama `.stat()` decenas de veces).
     */
    fs: {
      async readFile(uri: Uri): Promise<Uint8Array> {
        const result = await bridge.readFile(uri.fsPath)
        if (!result.success) throw new Error(result.error ?? `no se pudo leer ${uri.fsPath}`)
        return new TextEncoder().encode(result.value ?? '')
      },
      async writeFile(uri: Uri, content: Uint8Array): Promise<void> {
        const result = await bridge.writeFile(uri.fsPath, new TextDecoder().decode(content))
        if (!result.success) throw new Error(result.error ?? `no se pudo escribir ${uri.fsPath}`)
      },
      async stat(uri: Uri): Promise<FileStatImpl> {
        const result = await bridge.stat(uri.fsPath)
        if (!result.success || !result.stat) {
          throw new Error(result.error ?? `no se pudo leer la info de ${uri.fsPath}`)
        }
        return FileStatImpl.from(result.stat)
      },
      async readDirectory(uri: Uri): Promise<Array<[string, number]>> {
        const result = await bridge.readDirectory(uri.fsPath)
        if (!result.success) throw new Error(result.error ?? `no se pudo listar ${uri.fsPath}`)
        return result.entries ?? []
      },
      async createDirectory(uri: Uri): Promise<void> {
        const result = await bridge.createDirectory(uri.fsPath)
        if (!result.success) throw new Error(result.error ?? `no se pudo crear ${uri.fsPath}`)
      },
      async delete(uri: Uri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void> {
        const result = await bridge.deletePath(uri.fsPath, options)
        if (!result.success) throw new Error(result.error ?? `no se pudo borrar ${uri.fsPath}`)
      },
      async rename(
        from: Uri,
        to: Uri,
        options?: { overwrite?: boolean }
      ): Promise<void> {
        const result = await bridge.rename(from.fsPath, to.fsPath, options)
        if (!result.success) {
          throw new Error(result.error ?? `no se pudo mover ${from.fsPath} a ${to.fsPath}`)
        }
      },
      async copy(from: Uri, to: Uri, options?: { overwrite?: boolean }): Promise<void> {
        const result = await bridge.copy(from.fsPath, to.fsPath, options)
        if (!result.success) {
          throw new Error(result.error ?? `no se pudo copiar ${from.fsPath} a ${to.fsPath}`)
        }
      },
      /** El esquema que el IDE sirve localmente (para `isWritableFileSystem`). */
      isWritableFileSystem: (scheme: string): boolean | undefined =>
        scheme === 'file' ? true : undefined
    },
    getConfiguration: (section?: string) => configurationFor(section),

    // ── Documentos del editor (REALES) ─────────────────────────────────────
    // El IDE empuja cada documento abierto (texto, versión, dirty, lenguaje) y
    // aquí se ve como `TextDocument`. Los eventos son los del editor de verdad.
    get textDocuments(): TextDocumentImpl[] {
      return documents.all
    },
    onDidOpenTextDocument: (listener: (e: { document: TextDocumentImpl }) => void) =>
      documentEvents.open.event(listener),
    onDidChangeTextDocument: (listener: (e: ReturnType<typeof changeEvent>) => void) =>
      documentEvents.change.event(listener),
    onDidCloseTextDocument: (listener: (e: { document: TextDocumentImpl }) => void) =>
      documentEvents.close.event(listener),
    onDidSaveTextDocument: (listener: (e: { document: TextDocumentImpl }) => void) =>
      documentEvents.save.event(listener),
    /** Aún sin canal de vuelta al editor: no se finge un aviso que no llega. */
    onWillSaveTextDocument: noopEvent<unknown>(),
    /** La config del IDE todavía no se puede cambiar desde la extensión. */
    onDidChangeConfiguration: noopEvent<unknown>(),
    onDidChangeWorkspaceFolders: noopEvent<unknown>(),
    onWillCreateFiles: noopEvent<unknown>(),
    onWillDeleteFiles: noopEvent<unknown>(),
    onWillRenameFiles: noopEvent<unknown>(),
    // Los watchers de archivos del workspace aún no emiten (ver
    // `createFileSystemWatcher` en windowApi).
    onDidCreateFiles: noopEvent<unknown>(),
    onDidDeleteFiles: noopEvent<unknown>(),
    onDidRenameFiles: noopEvent<unknown>(),

    /**
     * Búsqueda de archivos REAL: la camina el MAIN (es el único que puede
     * tocar el disco) respetando el jail del workspace.
     */
    async findFiles(
      include: unknown,
      _exclude?: unknown,
      maxResults?: number
    ): Promise<Uri[]> {
      const pattern =
        typeof include === 'string'
          ? include
          : ((include as { pattern?: string } | undefined)?.pattern ?? '**/*')
      const result = await bridge.findFiles(pattern, {
        maxResults: typeof maxResults === 'number' && maxResults > 0 ? maxResults : 2000
      })
      if (result.error) bridge.log('warn', `workspace.findFiles("${pattern}"): ${result.error}`)
      if (result.truncated) {
        bridge.log(
          'warn',
          `workspace.findFiles("${pattern}") se cortó en el tope de resultados (${result.paths.length})`
        )
      }
      return result.paths.map((path) => Uri.file(path))
    },

    /**
     * Abre un documento SIN mostrar tab (como VS Code). Si ya está abierto en
     * el editor, devuelve ESE documento (mismo objeto: las extensiones guardan
     * referencias); si no, lo lee del disco por el canal enjaulado del main.
     *
     * Con un esquema VIRTUAL (`cline-diff:`, un log, un archivo generado) el
     * contenido lo sirve el provider registrado por la propia extensión.
     */
    async openTextDocument(uriOrPath: Uri | string): Promise<TextDocumentImpl> {
      const uri = typeof uriOrPath === 'string' ? Uri.parse(uriOrPath) : uriOrPath
      if (uri instanceof Uri && uri.scheme !== 'file') return await provideVirtualDocument(uri)
      const path = documentPath(uriOrPath)
      if (!path) throw new Error('workspace.openTextDocument necesita una ruta o un Uri')
      const open = documents.get(path)
      if (open) return open
      const result = await bridge.readFile(path)
      if (!result.success) {
        throw new Error(result.error ?? `no se pudo leer ${path}`)
      }
      return documents.openExternal(path, result.value ?? '', languageIdForPath(path), 1)
    },

    /**
     * Documentos VIRTUALES: la extensión provee el contenido (no hay archivo en
     * disco). Cline lo registra al activar; sin esto su `activate()` moría con
     * "registerTextDocumentContentProvider is not a function".
     *
     * El `onDidChange` del provider es REAL: cuando lo dispara, el IDE vuelve a
     * pedir el contenido y el cambio llega a `onDidChangeTextDocument`.
     */
    registerTextDocumentContentProvider(
      scheme: string,
      provider: TextDocumentContentProviderLike
    ): Disposable {
      contentProviders.set(scheme, provider)
      const subscription = provider.onDidChange?.((uri) => {
        const key = documentKey(uri)
        if (!documents.get(key)) return
        void provideVirtualDocument(uri).catch((error: unknown) =>
          bridge.log(
            'warn',
            `el provider "${scheme}" falló al refrescar ${uri.toString()}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        )
      })
      return new Disposable(() => {
        subscription?.dispose()
        if (contentProviders.get(scheme) === provider) contentProviders.delete(scheme)
      })
    },

    applyEdit(): never {
      throw unsupported('workspace.applyEdit')
    },

    createFileSystemWatcher: (...args: unknown[]) =>
      (windowApi as { createFileSystemWatcher: (...a: unknown[]) => unknown }).createFileSystemWatcher(
        ...args
      )
  }

  // ── env + contexto ──────────────────────────────────────────────────────
  /** Aviso de cambio del ajuste de telemetría (ver `setTelemetryEnabled`). */
  const telemetryEmitter = createEventEmitter<boolean>()
  const envApi = {
    appName: options.env?.appName ?? 'Scrakk Studio',
    appHost: 'scrakk',
    // El esquema REAL del IDE: `asWebviewUri` y `env.uriScheme` tienen que
    // coincidir, o las extensiones arman links que no cargan.
    uriScheme: options.env?.uriScheme ?? 'scrakk-ext',
    language: options.env?.language ?? 'es',
    machineId: options.env?.machineId ?? 'scrakk-local',
    appRoot: options.env?.appRoot,
    sessionId: `session-${Date.now()}`,
    isNewAppInstall: false,
    // Valor REAL del ajuste del IDE (viaja en `init` y cambia en caliente
    // con el evento `env/telemetry`). No se hardcodea: Cline y otras
    // extensiones deciden con esto si mandan datos, y un `false` mentiroso
    // las hace avisar "no coincide con tu configuración".
    isTelemetryEnabled: options.env?.isTelemetryEnabled === true,
    /** Shell del sistema (`env.shell`): lo resuelve el main. */
    shell: options.env?.shell,
    /** El ajuste cambió en el IDE: el host lo refleja aquí. */
    onDidChangeTelemetryEnabled: telemetryEmitter.event,
    remoteName: undefined,
    uiKind: 1, // UIKind.Desktop
    openExternal: async (uri: Uri): Promise<boolean> => {
      // Lo abre el MAIN (es el único con acceso al shell del sistema).
      const result = await bridge.openExternal(uri.toString())
      if (!result.success) bridge.log('warn', `env.openExternal falló: ${result.error ?? 'error'}`)
      return result.success
    },
    asExternalUri: async (uri: Uri): Promise<Uri> => uri,
    get version(): string {
      return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
    }
  }

  /**
   * `vscode.l10n` — traducciones de la extensión.
   *
   * Scrakk todavía no lee los bundles de traducción del paquete (`l10n/*`), y
   * eso NO se disimula: se devuelve el mensaje original con sus argumentos ya
   * sustituidos (lo que el usuario vería en el idioma base de la extensión).
   *
   * Existe por una razón medida: extensiones que traducen su UI llaman a
   * `l10n.t` en el arranque, y sin el namespace el `activate` moría con
   * "l10n.t is not a function" — un fallo por una cadena de texto.
   */
  const l10nApi = {
    t(...args: unknown[]): string {
      let message: unknown = args[0]
      let values: unknown[] = args.slice(1)
      // Con objeto de opciones, los valores vienen adentro (`{message, args}`).
      if (message && typeof message === 'object' && 'message' in message) {
        const options = message as { message?: unknown; args?: unknown }
        message = options.message
        values = Array.isArray(options.args) ? options.args : []
      }
      if (typeof message !== 'string') return String(message ?? '')
      return substitutePlaceholders(message, values)
    }
  }

  // ── Estado persistido y secretos (los pide el main, no el disco) ────────
  // Ver `extensionContext.ts`: VS Code los tiene LISTOS antes de `activate`.
  const globalState = createPersistentMemento(
    'global',
    options.globalState ?? {},
    (scope, key, value) => bridge.writeState(scope, key, value)
  )
  const workspaceState = createPersistentMemento(
    'workspace',
    options.workspaceState ?? {},
    (scope, key, value) => bridge.writeState(scope, key, value)
  )
  const secrets = createSecretStorage(
    (key) => bridge.getSecret(key),
    (key, value) => bridge.storeSecret(key, value),
    (key) => bridge.deleteSecret(key)
  )

  const context = createExtensionContext({
    shim: options,
    subscriptions,
    globalState,
    workspaceState,
    secrets,
    makeUri: (path) => Uri.file(path)
  })

  // ── Enums y clases "de datos" ───────────────────────────────────────────
  // No tienen comportamiento: existen para que el `require('vscode')` de la
  // extensión no devuelva `undefined` al hacer destructuring en el import — y
  // sobre todo para que los INICIALIZADORES ESTÁTICOS del bundle (que leen
  // `CodeActionKind.QuickFix` al cargar el módulo) no revienten antes de
  // activar. Ver `enums.ts` y `dataTypes.ts`.
  const enums = {
    ViewColumn,
    ...enumValues
  }

  /** Clases de datos que las extensiones instancian (`new vscode.Diagnostic(…)`). */
  const dataClasses = {
    Diagnostic,
    DiagnosticRelatedInformation,
    Location,
    CodeLens,
    CodeAction,
    CompletionItem,
    CompletionList,
    SnippetString,
    Hover,
    DocumentLink,
    TextEdit,
    WorkspaceEdit,
    SymbolInformation,
    DocumentSymbol,
    InlayHint,
    CallHierarchyItem,
    CallHierarchyIncomingCall,
    CallHierarchyOutgoingCall,
    TypeHierarchyItem,
    TypeHierarchyIncomingCall,
    TypeHierarchyOutgoingCall,
    SemanticTokens,
    SemanticTokensBuilder,
    SemanticTokensEdit,
    SemanticTokensLegend,
    SelectionRange,
    FoldingRange,
    EvaluationResult
  }

  class ThemeColor {
    constructor(readonly id: string) {}
  }

  /**
   * Botón de un mensaje con más información que una etiqueta.
   * Extensiones viejas hacen `new vscode.MessageItem('Sí', false)`; el tipo
   * tiene que existir o el `new` revienta antes de que la UI se entere.
   */
  class MessageItem implements MessageItemLike {
    constructor(
      readonly title: string,
      readonly isCloseAffordance: boolean = false
    ) {}
  }

  class MarkdownString {
    value: string
    constructor(value = '') {
      this.value = value
    }
    appendText(text: string): MarkdownString {
      this.value += text
      return this
    }
    appendMarkdown(value: string): MarkdownString {
      this.value += value
      return this
    }
  }

  class CancellationTokenSource {
    private cancelled = false
    readonly token = {
      isCancellationRequested: false,
      onCancellationRequested: noopEvent<unknown>()
    }
    cancel(): void {
      if (this.cancelled) return
      this.cancelled = true
      this.token.isCancellationRequested = true
    }
    dispose(): void {
      /* nada que liberar */
    }
  }

  class RelativePattern {
    constructor(
      readonly base: unknown,
      readonly pattern: string
    ) {}
  }

  const api: Record<string, unknown> = {
    // comandos
    commands: commandsApi,

    // UI
    window: windowApi,

    // workspace
    workspace: workspaceApi,

    // lenguajes (proveedores inertes, ver languagesApi)
    languages: languagesApi,

    // entorno
    env: envApi,

    // traducciones de la extensión (`vscode.l10n`).
    l10n: l10nApi,

    // datos
    Uri,
    // Clases de posición/rango REALES (con contains/intersection/compareTo:
    // las extensiones de anclas y marcadores las usan de verdad).
    Position,
    Range,
    Selection,
    TextLine,
    FileStat: FileStatImpl,
    TreeItem,
    TreeItemCollapsibleState,
    ThemeIcon,
    ThemeColor,
    MessageItem,
    MarkdownString,
    RelativePattern,
    CancellationTokenSource,
    CancellationError,
    EventEmitter,
    Disposable,
    ...enums,
    ...dataClasses,

    // `vscode.version` = versión del API (no la de la app): las librerías la
    // usan como gate y con la de la app rechazaban al cliente LSP entero.
    // La de la APP se reporta en `env.version`.
    version: VSCODE_API_VERSION,

    // `extension` (el namespace de la propia extensión) lo completa el host.
    extensions: {
      getExtension: () => undefined,
      all: [] as unknown[],
      onDidChange: noopEvent<unknown>()
    }
  }

  return {
    api,
    registeredCommands: () => [...commands.keys()],
    viewProviders: () => viewProviders,
    contentProviderSchemes: () => [...contentProviders.keys()],
    treeViewIds: () => trees.viewIds(),
    async resolveView(viewId: string, initialTitle: string): Promise<'webview' | 'tree'> {
      const provider = viewProviders.get(viewId)
      if (provider) {
        const handle = resolveView(viewId, initialTitle)
        await provider.resolveWebviewView(handle, { state: undefined }, {
          isCancellationRequested: false
        })
        return 'webview'
      }
      // Sin provider webview: puede ser un árbol. Se publica la raíz y el
      // renderer la pinta (los hijos se piden bajo demanda).
      if (trees.has(viewId)) {
        bridge.pushTree(viewId, await trees.root(viewId))
        return 'tree'
      }
      // Ni una cosa ni la otra: error claro en vez de un panel vacío mudo.
      throw new Error(
        `la extensión no registró ninguna vista para "${viewId}" ` +
          `(ni registerWebviewViewProvider ni registerTreeDataProvider)`
      )
    },
    async treeChildren(viewId: string, elementId: string | null): Promise<TreeNodeModel[]> {
      return await trees.children(viewId, elementId)
    },
    async treeSelect(viewId: string, elementId: string): Promise<{ ran: boolean; command?: string }> {
      const command = await trees.select(viewId, elementId)
      if (!command) return { ran: false }
      // Se ejecuta CON los argumentos originales (no los serializados): las
      // extensiones pasan `Uri`s y objetos propios en `command.arguments`.
      await commandsApi.executeCommand(command.command, ...(command.arguments ?? []))
      return { ran: true, command: command.command }
    },
    deliverViewMessage(viewId: string, message: unknown): void {
      // Los paneles del editor comparten el ruteo (sus ids van prefijados con
      // `panel:`, así que no pueden confundirse con una vista).
      if (panels.deliver(viewId, message)) return
      openViews.get(viewId)?.deliver(message)
    },
    deliverPanelMessage(id: string, message: unknown): void {
      panels.deliver(id, message)
    },
    setTelemetryEnabled(enabled: boolean): void {
      if (envApi.isTelemetryEnabled === enabled) return
      envApi.isTelemetryEnabled = enabled
      telemetryEmitter.fire(enabled)
    },
    applyDocumentEvent(event: DocumentEvent): void {
      documents.apply(event)
    },
    seedDocuments(events: DocumentEvent[]): void {
      documents.seed(events)
    },
    disposeView(viewId: string): void {
      openViews.get(viewId)?.dispose()
      openViews.delete(viewId)
      trees.dispose(viewId)
    },
    disposePanel(id: string): void {
      panels.get(id)?.dispose()
    },
    async executeLocalCommand(id: string, args: unknown[]): Promise<unknown> {
      const callback = commands.get(id)
      if (!callback) throw new Error(`la extensión no registró el comando "${id}"`)
      return await callback(...args)
    },
    /**
     * Consulta un proveedor de lenguaje (lo pide el IDE por `provider/query`).
     *
     * El documento se resuelve aquí: si el archivo no está abierto en el
     * editor, se lee del disco (el jail lo aplica el main) y se materializa
     * como `TextDocument` real — un provider que recibe `undefined` no puede
     * hacer su trabajo, y muchas veces la definición salta a un archivo que
     * nadie tiene abierto.
     */
    async queryProvider(params: ProviderQueryParams): Promise<ProviderQueryResult> {
      const document = await ensureDocument(params.path)
      if (!document) return { matched: false, result: null }
      return await languageProviders.query({
        kind: params.kind,
        document,
        position: params.position,
        range: params.range,
        context: params.context,
        options: params.options
      })
    },
    async executeCommand(id: string, args: unknown[]): Promise<unknown> {
      // Mismo camino que usa la extensión: local primero, IDE después. La
      // degradación de un built-in sin equivalente la explica el IDE (ver
      // `commandUnavailableReason`), no un error de "no registró".
      return await commandsApi.executeCommand(id, ...args)
    },
    async activate(extensionModule: ExtensionModule): Promise<void> {
      if (typeof extensionModule.activate === 'function') {
        await extensionModule.activate(context)
      }
    },
    async deactivate(extensionModule: ExtensionModule): Promise<void> {
      for (const view of openViews.values()) view.dispose()
      openViews.clear()
      trees.disposeAll()
      // Los items de la barra y los paneles del editor son de ESTA extensión:
      // al apagarla no puede quedar nada suyo en la UI.
      statusBar.disposeAll()
      panels.disposeAll()
      diagnostics.disposeAll()
      // Los subrayados de la extensión se van con ella (si no, quedan rangos
      // pintados de algo que ya no corre y el usuario no puede saber por qué).
      decorations.disposeAll()
      documents.disposeAll()
      for (const subscription of subscriptions) {
        try {
          subscription.dispose()
        } catch {
          /* una suscripción rota no impide desactivar el resto */
        }
      }
      subscriptions.length = 0
      if (typeof extensionModule.deactivate === 'function') {
        await extensionModule.deactivate()
      }
    }
  }
}
