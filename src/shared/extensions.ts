/**
 * Módulo compartido (main + preload + renderer) — contrato IPC del sistema
 * de extensiones SEF.
 *
 * El renderer no tiene acceso al filesystem de Node. Instalar/desinstalar
 * extensiones del usuario corre en el proceso main: se descomprime el `.sef`
 * en `app.getPath('userData')/extensions/<id>/` y se devuelve el summary.
 */

import type { DocumentEvent, TreeNodeModel } from './extensionHost/protocol'
import type { QueryCategory } from './syntax/queries'

export type { DocumentEvent } from './extensionHost/protocol'

export const EXTENSIONS_IPC = {
  installSef: 'extensions:install-sef',
  installVsix: 'extensions:install-vsix',
  uninstall: 'extensions:uninstall',
  listInstalled: 'extensions:list-installed',
  extensionsDir: 'extensions:extensions-dir',
  pickSef: 'extensions:pick-sef',
  pickVsix: 'extensions:pick-vsix',
  retranslateVsix: 'extensions:retranslate-vsix',
  /** Tokeniza con la gramática TextMate de una extensión (proceso main). */
  tokenize: 'extensions:tokenize',
  /**
   * Tokeniza con un parser tree-sitter DINÁMICO (wasm del paquete).
   *
   * Va por un proceso aparte por una razón concreta: es un `.wasm` de
   * terceros ejecutándose por primera vez. Un parser con un bug de memoria
   * puede tirar el proceso entero, y en el main eso es la ventana.
   */
  tokenizeDynamic: 'extensions:tokenize-dynamic'
} as const

// ── Tokenizado (gramáticas TextMate) ──────────────────────────────────────

/** Una gramática que el renderer ya identificó (ruta absoluta del paquete). */
export interface TokenizeGrammarRef {
  /** `source.zig`, `text.html.basic`… */
  scopeName: string
  /** Ruta absoluta del `.tmLanguage`/`.tmLanguage.json`/`.plist`. */
  path: string
  /**
   * ID del lenguaje al que pertenece la gramática.
   *
   * Es lo que permite resolver un LENGUAJE EMBEBIDO: el tramo con scope
   * `meta.embedded.block.gleam` se re-tokeniza con la gramática cuyo `language`
   * es `gleam`.
   */
  language?: string
  /** `scope` → languageId (el `embeddedLanguages` del manifest de VS Code). */
  embeddedLanguages?: Record<string, string>
  /** Scopes de OTROS lenguajes en los que esta gramática se inyecta. */
  injectTo?: string[]
}

export interface TokenizeRequest {
  /** Scope raíz del documento. */
  scopeName: string
  /** Gramáticas candidatas (raíz + embebidas), con rutas absolutas. */
  grammars: TokenizeGrammarRef[]
  text: string
}

export interface TokenizeResult {
  ok: boolean
  error?: string
  /** Stacks de scope únicos: los tokens apuntan aquí por índice. */
  scopeSets: string[][]
  /** `start`/`end` en columnas UTF-16 de la línea (0-based). */
  tokens: Array<{ line: number; start: number; end: number; scopes: number }>
}

// ── Tokenizado dinámico (tree-sitter wasm del paquete) ────────────────────

/** Una query `.scm` del paquete, ya resuelta a ruta absoluta. */
export interface DynamicQueryRef {
  /** Ruta absoluta del `.scm`. */
  file: string
  /** Categoría (sólo `highlights` produce color hoy). */
  category: QueryCategory
}

export interface DynamicTokenizeRequest {
  /** Lenguaje del registro que pidió el tokenizado (diagnóstico/reporte). */
  languageId: string
  /** Ruta absoluta del parser `.wasm` (o `.so`/`.dll` si `native`). */
  parserPath: string
  /** sha256 esperado del parser (si el manifest lo declara). */
  sha256?: string
  /** ABI declarada (`tree-sitter-abi-14`): se advierte si no coincide. */
  abi?: string
  /**
   * Queries del paquete a aplicar, con su categoría.
   *
   * Se mandan TODAS las categorías usables: el worker decide qué hacer con
   * cada una (`highlights` → color, `tags` → símbolos, `folds` → plegado,
   * `injections` → tramos de otro lenguaje, `locals` → alcances,
   * `textobjects` → rangos seleccionables). Mandar sólo `highlights` era el
   * motivo por el que tags/locals/folds "estaban en el repo y nunca se leían".
   */
  queries: DynamicQueryRef[]
  /**
   * Parsers de lenguajes EMBEBIDOS, por si una `injections.scm` los necesita.
   * Sin esto la inyección se reporta pero no se colorea (no es un error:
   * puede que la extensión no esté instalada).
   */
  embedded?: DynamicEmbeddedParserRef[]
  text: string
}

// ── Datos que produce el ÁRBOL (no sólo color) ────────────────────────────

/**
 * Símbolo sacado de `tags.scm`.
 *
 * El `kind` es el que declara la convención de tags de tree-sitter
 * (`@definition.function` → `function`), NO un enum propio: es el que ya usa
 * el outline de la app (`DocumentSymbol.kind` de `symbolExtractor`). Se anida
 * por CONTENCIÓN de rangos, no por profundidad en el árbol: es lo que hace
 * que un método quede dentro de su clase sin que la extensión lo declare.
 */
export interface DynamicSymbolNode {
  name: string
  kind: string
  line: number
  column: number
  endLine: number
  endColumn: number
  children: DynamicSymbolNode[]
}

/** Rango plegable de `folds.scm` (línea final incluida, como el motor). */
export interface DynamicFoldRange {
  startLine: number
  endLine: number
  /** `comment`, `imports`, `region`… (lo que declare la query). */
  kind: string
}

/**
 * Tramo del archivo que pertenece a OTRO lenguaje (`injections.scm`).
 *
 * Es el equivalente dinámico del `embeddedLanguages` de VS Code: el worker lo
 * re-tokeniza con el parser del lenguaje inyectado (si el renderer se lo pasó)
 * y los tokens vuelven mezclados con los del lenguaje raíz.
 */
export interface DynamicInjectionRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  /** Lenguaje que declara la inyección (`javascript`, `css`…). */
  language: string
  /** `true` = `@injection.combined`: todo el lenguaje comparte un solo árbol. */
  combined: boolean
}

/**
 * Definición o referencia de `locals.scm`.
 *
 * Es lo que permite resolver "a qué definición apunta esta variable" sin LSP:
 * el `scope` es el `@local.scope` que la contiene, así que una referencia se
 * resuelve contra la definición del scope más cercano (y no contra la primera
 * del archivo con el mismo nombre).
 */
export interface DynamicLocalEntry {
  kind: 'definition' | 'reference'
  /** Nombre del símbolo (el texto del `@name`/`@local.*` de la query). */
  name: string
  line: number
  column: number
  endLine: number
  endColumn: number
  scope: {
    startLine: number
    startColumn: number
    endLine: number
    endColumn: number
  } | null
}

/** Rango seleccionable de `textobjects.scm`. */
export interface DynamicTextObject {
  /** `function.inner`, `class.outer`, `parameter.outer`… */
  name: string
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

/**
 * Todo lo que el árbol sabe del archivo, además del color.
 *
 * Viaja junto con los tokens en la MISMA respuesta: el parser ya está cargado
 * y el árbol ya está construido, así que correr las otras queries es casi
 * gratis comparado con volver a levantar el worker.
 */
export interface DynamicSyntaxData {
  symbols: DynamicSymbolNode[]
  folds: DynamicFoldRange[]
  injections: DynamicInjectionRange[]
  locals: DynamicLocalEntry[]
  textObjects: DynamicTextObject[]
  /**
   * Nivel de indentación por línea (`indents.scm`), con una entrada extra para
   * la línea virtual siguiente a la última. Es lo que usa el motor al Enter.
   */
  indentLevels?: number[]
  /**
   * Categorías que REALMENTE se aplicaron.
   *
   * Sin esto, "el outline está vacío" no se puede distinguir de "la extensión
   * no declaró `tags.scm`", que son dos bugs distintos.
   */
  appliedCategories: QueryCategory[]
}

/**
 * Parser de un lenguaje EMBEBIDO (el que una `injections.scm` puede necesitar).
 *
 * Se manda por adelantado —con sus queries de resaltado— porque el worker no
 * puede leer el manifest de la extensión: decidir qué lenguaje inyecta una
 * query es un dato del paquete, y resolverlo en el renderer es lo que permite
 * que el main siga sin saber nada del registro de lenguajes.
 */
export interface DynamicEmbeddedParserRef {
  /** `javascript`, `css`… tal como lo nombra la inyección. */
  languageId: string
  parserPath: string
  sha256?: string
  abi?: string
  /** Queries que necesita el lenguaje inyectado (normalmente `highlights`). */
  queries: DynamicQueryRef[]
}

export interface DynamicTokenizeResult extends TokenizeResult {
  /** Queries que se pudieron COMPILAR (las rotas se reportan, no se callan). */
  applied: string[]
  /** Queries que no compilaron, con el motivo. */
  failed: Array<{ file: string; error: string }>
  /**
   * Lo que el árbol produce además del color (símbolos, plegado, inyecciones…).
   * Ausente sólo si el pedido no llegó a parsear.
   */
  data?: DynamicSyntaxData
}

// ── Installed ─────────────────────────────────────────────────────────────

export type ExtensionSource = 'sef' | 'vscode' | 'zed'

export interface InstalledExtensionInfo {
  id: string
  name: string
  version: string
  author?: string
  /** Directorio de la extensión dentro de userData/extensions. */
  dir: string
  /** Procedencia (el core la ignora; la UI la muestra). */
  source?: ExtensionSource
  /** Cobertura del traductor (solo convertidas). */
  coverage?: number
}

// ── Install SEF ────────────────────────────────────────────────────────────

export interface InstallSefRequest {
  path: string
}

export type InstallSefResponse =
  | { success: true; extension: InstalledExtensionInfo }
  | { success: false; error: string }

// ── Uninstall ──────────────────────────────────────────────────────────────

export interface UninstallRequest {
  id: string
}

export interface UninstallResponse {
  success: boolean
  error?: string
}

// ── Pick SEF (diálogo nativo) ──────────────────────────────────────────────

export interface PickSefResponse {
  success: boolean
  path?: string
  error?: string
}

// ── Install VSIX (vía traductor de compatibilidad) ─────────────────────────

export interface InstallVsixRequest {
  path: string
}

export interface VsixCompatSummary {
  coverage: number
  warning: string | null
  translatedFileIcons: number
  translatedThemes: number
  translatedProductIcons: number
  requiresNode: boolean
}

export type InstallVsixResponse =
  | { success: true; extension: InstalledExtensionInfo; compat: VsixCompatSummary }
  | { success: false; error: string }

export interface PickVsixResponse {
  success: boolean
  path?: string
  error?: string
}


// ── FS escopado por extensión (enforcement en main) ──────────────────────

export const EXT_FS_IPC = {
  read: 'ext:fs-read',
  write: 'ext:fs-write',
  lspCheck: 'ext:lsp-check'
} as const

export interface ScopedFsRequest {
  extensionId: string
  path: string
}

export interface ScopedFsReadResponse {
  success: boolean
  content?: string
  error?: string
}

export interface ScopedFsWriteRequest extends ScopedFsRequest {
  content: string
}

export interface ScopedFsWriteResponse {
  success: boolean
  error?: string
}// ── Extension Host (ejecución del código de la extensión) ─────────────────

/**
 * Canales del Extension Host.
 *
 * El renderer NO habla con el proceso de la extensión: pide al main, el main
 * aplica permisos y jail de paths, y recién ahí rutea al host. Es el mismo
 * modelo que los canales `ext:fs-*`.
 *
 * Las vistas tienen DOS sabores: `webview` (la extensión publica HTML y el
 * IDE lo muestra en un iframe aislado) y `tree` (la extensión sirve nodos y
 * el IDE los pinta con `treeChildren`/`treeSelect`). Cuál es cuál lo responde
 * `resolveView`.
 */
export const EXTENSION_HOST_IPC = {
  /** Asegura el host de una extensión y corre `activate()`. */
  ensure: 'extensions:host-ensure',
  /** Pide el HTML de una vista (la extensión lo publica). */
  resolveView: 'extensions:host-resolve-view',
  /** Hijos de un nodo de una vista de árbol (`null` = raíz). */
  treeChildren: 'extensions:host-tree-children',
  /** Click en un nodo de una vista de árbol (corre su comando). */
  treeSelect: 'extensions:host-tree-select',
  /** El panel se desmontó: libera la vista en la extensión. */
  disposeView: 'extensions:host-dispose-view',
  /** Mensaje del iframe hacia la extensión. */
  viewMessage: 'extensions:host-view-message',
  /** Ejecuta un comando EN la extensión. */
  executeCommand: 'extensions:host-execute-command',
  /** Apaga el host (desactivar/desinstalar). */
  shutdown: 'extensions:host-shutdown',
  /** URL `scrakk-ext://` del documento del webview. */
  webviewUrl: 'extensions:host-webview-url',
  /** URL `scrakk-ext://` del documento de un PANEL del editor. */
  panelUrl: 'extensions:host-panel-url',
  /** El usuario cerró la tab del panel: se lo decimos a la extensión. */
  panelClose: 'extensions:host-panel-close',
  /**
   * renderer → main: hechos del editor (documentos abiertos/cambiados/activos).
   * El main los guarda (para sembrar hosts nuevos) y los reenvía a los hosts.
   */
  docSync: 'extensions:host-documents',
  /** main → renderer: eventos del host (html, título, post, logs). */
  event: 'extensions:host-event',
  /** main → renderer: petición que necesita la UI (notificar, comando). */
  invoke: 'extensions:host-invoke',
  /** renderer → main: respuesta a `invoke`. */
  invokeResult: 'extensions:host-invoke-result',
  /**
   * renderer → main: "ya tengo el puente conectado". Sin esto, el main no
   * puede saber si hay quien atienda sus peticiones, y una petición enviada
   * antes del boot se pierde en un timeout silencioso (ver Cline).
   */
  uiReady: 'extensions:host-ui-ready',
  /**
   * renderer → main: el ajuste de telemetría del IDE (`telemetry.enabled`).
   * El main lo guarda —para los hosts que arranquen después— y avisa a los
   * hosts vivos (`env/telemetry`) para que `env.isTelemetryEnabled` no quede
   * congelado en el valor del arranque.
   */
  telemetry: 'extensions:host-telemetry'
} as const

export interface HostEnsureRequest {
  id: string
  /** Roots del workspace abierto (el main los usa como jail del fs). */
  workspaceRoots: string[]
  /** Modo de aislamiento elegido por el usuario para esta extensión. */
  mode: 'strict' | 'compat'
}

export type HostEnsureResponse =
  | { success: true; commands: string[] }
  | { success: false; error: string }

export interface HostViewRequest {
  id: string
  viewId: string
  /** Título inicial (la extensión puede cambiarlo después). */
  title?: string
}

export type HostSimpleResponse = { success: boolean; error?: string }

/** Respuesta de `resolveView`: el tipo de vista lo decide la extensión. */
export type HostResolveViewResponse =
  | { success: true; kind: 'webview' | 'tree' }
  | { success: false; error: string }

export interface HostTreeChildrenRequest extends HostViewRequest {
  /** `null` = nodos raíz. */
  elementId: string | null
}

export interface HostTreeChildrenResponse {
  success: boolean
  nodes?: TreeNodeModel[]
  error?: string
}

export interface HostTreeSelectRequest extends HostViewRequest {
  elementId: string
}

export interface HostTreeSelectResponse {
  success: boolean
  /** La extensión no puso comando en ese nodo. */
  ran?: boolean
  command?: string
  error?: string
}

export interface HostViewMessageRequest extends HostViewRequest {
  message: unknown
}

export interface HostCommandRequest {
  id: string
  command: string
  args?: unknown[]
}

export type HostCommandResponse =
  | { success: true; result: unknown }
  | { success: false; error: string }

/** Evento del host que la UI debe reflejar. */
export interface HostEventMessage {
  extensionId: string
  event:
    | 'view/html'
    | 'view/title'
    | 'view/post'
    | 'view/tree'
    | 'view/tree-change'
    /** La extensión creó/actualizó/quitó un item de la barra de estado. */
    | 'status/item'
    /**
     * La extensión publicó/limpió diagnósticos: la UI los lista (panel de
     * Problemas + chip de la barra de estado) y los cuenta.
     */
    | 'diagnostics/change'
    /**
     * La extensión subrayó rangos en el editor (`editor.setDecorations`): el
     * IDE los pinta dentro del texto con el canal de subrayados del motor.
     */
    | 'decorations/set'
    /** La extensión abrió un panel de webview en el área del editor. */
    | 'panel/open'
    | 'panel/update'
    | 'panel/close'
    /** La extensión puso una clave de contexto (`setContext`), para los `when`. */
    | 'context/key'
    /**
     * `activate` sigue en curso: `{ seconds, pending }`. `activate` NO tiene
     * timeout (igual que en VS Code), así que este latido es lo que permite
     * ver un arranque lento o colgado en vez de un panel mudo.
     */
    | 'activate/progress'
    | 'command/registered'
    | 'log'
    | 'fatal'
    | 'exit'
  payload: unknown
}

/**
 * Petición del main que requiere la UI (registries reales del IDE).
 *
 * `editor/open` es la única que devuelve algo distinto de un resultado
 * genérico: el IDE abre la tab y responde si pudo.
 */
export interface HostInvokeRequest {
  invokeId: number
  method: 'notify' | 'command/execute' | 'editor/open'
  params: unknown
}

export interface HostInvokeResult {
  invokeId: number
  result?: unknown
  error?: string
}

/**
 * Superficie del Extension Host expuesta al renderer.
 * `onEvent` devuelve el unsubscribe (los listeners viven en el renderer).
 */
export interface ExtensionHostApi {
  ensure(request: HostEnsureRequest): Promise<HostEnsureResponse>
  resolveView(request: HostViewRequest): Promise<HostResolveViewResponse>
  /** Hijos de un nodo de un árbol (`elementId: null` = raíz). */
  treeChildren(request: HostTreeChildrenRequest): Promise<HostTreeChildrenResponse>
  /** Correr el comando del nodo clickeado. */
  treeSelect(request: HostTreeSelectRequest): Promise<HostTreeSelectResponse>
  disposeView(request: HostViewRequest): Promise<HostSimpleResponse>
  viewMessage(request: HostViewMessageRequest): Promise<HostSimpleResponse>
  executeCommand(request: HostCommandRequest): Promise<HostCommandResponse>
  shutdown(id: string): Promise<HostSimpleResponse>
  /** URL del documento del webview para el iframe (`scrakk-ext://…`). */
  webviewUrl(request: HostViewRequest): Promise<string>
  /** URL del documento de un panel del editor (`scrakk-ext://…/__panel__/…`). */
  panelUrl(request: { id: string; panelId: string }): Promise<string>
  /** Avisa que el usuario cerró la tab de un panel (dispara `onDidDispose`). */
  panelClose(request: { id: string; panelId: string }): Promise<HostSimpleResponse>
  /** Suscribe a los eventos del host. Devuelve el unsubscribe. */
  onEvent(listener: (message: HostEventMessage) => void): () => void
  /**
   * Publica el estado REAL del ajuste de telemetría a los hosts de
   * extensiones (`env.isTelemetryEnabled`). Lo llama el renderer al arrancar
   * y cada vez que el usuario cambia el ajuste.
   */
  setTelemetryEnabled: (enabled: boolean) => void
  /** Suscribe a las peticiones del main que necesitan la UI. Devuelve el unsubscribe. */
  onInvoke(listener: (request: HostInvokeRequest) => void): () => void
  /** Responde a una petición del main que requirió la UI. */
  respondInvoke(result: HostInvokeResult): void
  /** Avisa al main que el puente de la UI ya está escuchando. */
  signalReady(): void
  /**
   * Sincroniza al host con el editor: documentos abiertos, cambios de buffer,
   * activo y guardados. Es la fuente de `workspace.textDocuments`.
   */
  syncDocuments(events: DocumentEvent[]): void
}

// ── API type for preload ───────────────────────────────────────────────────
export interface ExtensionsApi {
  /** Ejecución de extensiones (Extension Host). */
  host: ExtensionHostApi
  /** Descomprime un `.sef` en userData/extensions/<id> y devuelve su info. */
  installSef: (path: string) => Promise<InstallSefResponse>
  /** Convierte un `.vsix` vía compatibility y lo materializa como SEF. */
  installVsix: (path: string) => Promise<InstallVsixResponse>
  /** Borra la carpeta instalada de una extensión. */
  uninstall: (id: string) => Promise<UninstallResponse>
  /** Lista las extensiones del usuario instaladas en userData. */
  listInstalled: () => Promise<InstalledExtensionInfo[]>
  /** Ruta absoluta de userData/extensions (creada si no existe). */
  extensionsDir: () => Promise<string>
  /** Abre el diálogo nativo para elegir un archivo `.sef`. */
  pickSef: () => Promise<PickSefResponse>
  /** Abre el diálogo nativo para elegir un archivo `.vsix`. */
  pickVsix: () => Promise<PickVsixResponse>
  /** Re-traduce las VSIX viejas con el traductor actual (requiere el original). */
  retranslateVsix: () => Promise<{ success: boolean; updated: string[]; skipped: string[] }>
  /**
   * Tokeniza con la gramática TextMate que declara una extensión de lenguaje.
   *
   * Devuelve SCOPES, no colores: el color es del tema y el tema vive en el
   * renderer. Corre en el main porque ahí están los archivos y el `.wasm` de
   * Oniguruma (y porque no bloquea la UI).
   */
  tokenize: (request: TokenizeRequest) => Promise<TokenizeResult>
  /** Tokeniza con el parser tree-sitter del paquete (proceso aparte). */
  tokenizeDynamic: (request: DynamicTokenizeRequest) => Promise<DynamicTokenizeResult>
  /** FS enjaulado por permisos — enforcement en el proceso main. */
  fsFor: (extensionId: string) => {
    readFile: (path: string) => Promise<ScopedFsReadResponse>
    writeFile: (path: string, content: string) => Promise<ScopedFsWriteResponse>
  }
}