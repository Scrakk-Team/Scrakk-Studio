/**
 * Protocolo del Extension Host — contrato main ↔ host ↔ renderer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ¿POR QUÉ UN PROCESO APARTE?
 *
 * Las extensiones de VS Code llevan CÓDIGO (`main` → Node). A diferencia de
 * un tema o unos iconos, su contenido NO es declarativo: el HTML del panel
 * lo produce la extensión en runtime (webview, tree view…). Por lo tanto hay
 * que **ejecutarla**, y eso jamás puede pasar en el proceso que dibuja la
 * UI ni con acceso libre al disco.
 *
 *   renderer (sandbox)  ──IPC──▶  main (enforcement)  ──stdio──▶  host (Node)
 *        React                 permisos + workspace            vscode shim
 *
 * El host corre en un proceso Node que NO tiene acceso a Electron ni al
 * renderer. Todo lo que necesita (leer un archivo, mostrar una notificación,
 * pintar el panel) pasa por este protocolo, y el `main` es el que decide si
 * se lo concede.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Los mensajes son objetos planos con un sobre RPC mínimo (`RpcPeer`), y el
 * canal es DELIBERADAMENTE tonto: hoy `process.parentPort` de Electron. La
 * razón es que **Owear probablemente reemplace el mecanismo de ejecución**
 * (otro runtime, otro ABI, quizá sin Node). Cuando eso pase, se reescribe
 * SÓLO el transporte (`send`/`receive` en `extensions/host/entry.ts` y
 * `hostManager.ts`) y todo lo demás queda igual: el shim habla `HostBridge`,
 * no el canal. NO metas lógica del shim ni de Node en el transporte.
 */

/** Versión del protocolo. Se rechaza un host que hable otra major. */

import type { LspDiagnostic } from '@shared/lsp'

export const HOST_PROTOCOL_VERSION = 2

// ── Sobre RPC ─────────────────────────────────────────────────────────────

/**
 * Petición entre main y host (espera respuesta con el mismo `id`).
 *
 * Los `id` se reparten por signo para que las dos direcciones no colisionen
 * sin coordinación: **positivos = los inicia el main** (ciclo de vida,
 * comandos, vistas) y **negativos = los inicia el host** (pedirle algo al
 * usuario, escribir en disco).
 */
export interface HostRequestMessage {
  kind: 'request'
  id: number
  method: HostMethod | HostToMainMethod
  params?: unknown
}

/** Respuesta host → main a una petición previa. */
export interface HostResponseMessage {
  kind: 'response'
  id: number
  result?: unknown
  error?: string
}

/** Evento host → main (sin respuesta). */
export interface HostEventMessage {
  kind: 'event'
  event: HostEvent | MainEvent
  payload?: unknown
}

export type HostMessage = HostRequestMessage | HostResponseMessage | HostEventMessage

/**
 * Métodos que el main puede invocar en el host.
 * `init` y `activate` son el ciclo de vida; el resto es la superficie usada
 * por las contribuciones (vistas y comandos).
 */
export type HostMethod =
  /** Configura el host: ruta del paquete, entry, roots y permisos. */
  | 'init'
  /** Corre `activate(context)` de la extensión. */
  | 'activate'
  /** Corre `deactivate()` y libera recursos (antes del kill). */
  | 'deactivate'
  /** Ejecuta un comando registrado por la extensión. */
  | 'command/execute'
  /** Resuelve el provider de una vista (crea el `WebviewView` o el árbol). */
  | 'view/resolve'
  /** La vista dejó de estar visible: se libera su `WebviewView`. */
  | 'view/dispose'
  /** El usuario cerró la tab de un panel del editor: se libera el panel. */
  | 'panel/dispose'
  /** Mensaje del iframe (`acquireVsCodeApi().postMessage`) hacia la extensión. */
  | 'view/receive'
  /** Hijos de un nodo del árbol (`null` = raíz). */
  | 'tree/children'
  /** Click en un nodo del árbol: corre el comando del item CON sus args reales. */
  | 'tree/select'
  /**
   * Consulta un proveedor de lenguaje de la extensión (hover, definición,
   * referencias, formateo…). Es lo que hace que el LSP de una extensión se vea
   * en el editor: la cadena es IDE → main → host (el provider de verdad).
   */
  | 'provider/query'

/**
 * Tipos de proveedor que el IDE consulta hoy.
 *
 * Es una lista CERRADA a propósito: el resto (`registerCompletionItemProvider`,
 * code lens, tokens semánticos…) se registra sin romper el `activate`, pero el
 * editor no tiene UI para ellos todavía, así que prometer una consulta sería
 * mentir. Agregar uno aquí es agregar su serialización y su consumidor.
 */
export type LanguageProviderKind =
  | 'hover'
  | 'definition'
  | 'declaration'
  | 'implementation'
  | 'typeDefinition'
  | 'references'
  | 'documentHighlight'
  | 'formatting'
  | 'rangeFormatting'

/** Posición 0-based (misma convención que el LSP y que el API de VS Code). */
export interface ProviderPosition {
  line: number
  character: number
}

export interface ProviderRange {
  start: ProviderPosition
  end: ProviderPosition
}

/** Parámetros de `provider/query`: qué, dónde y con qué contexto. */
export interface ProviderQueryParams {
  kind: LanguageProviderKind
  /** Ruta absoluta del documento (el host lo abre si no está en memoria). */
  path: string
  position?: ProviderPosition
  range?: ProviderRange
  /** `references`: `{ includeDeclaration }`. */
  context?: { includeDeclaration?: boolean }
  /** `formatting`: opciones de formato. */
  options?: { tabSize?: number; insertSpaces?: boolean }
}

/**
 * Resultado de `provider/query`.
 *
 * `matched: false` = NINGÚN proveedor registrado atiende ese documento (el
 * main lo usa para no contar como respuesta a una extensión que no opina). El
 * `result` ya viene en la forma del LSP (lo serializa el host, que es el único
 * que tiene las clases reales del API).
 */
export interface ProviderQueryResult {
  matched: boolean
  result: unknown
}

/**
 * Eventos que el host emite hacia el main.
 * El main los rutea al renderer (o los aplica: notificaciones, fs…).
 * Los eventos del MAIN hacia el host son `MainEvent` (más abajo).
 */
export type HostEvent =
  /** El host terminó de bootear y habla esta versión del protocolo. */
  | 'ready'
  /** Log de la extensión (console.* capturado o error de activación). */
  | 'log'
  /** `commands.registerCommand` / desregistro. */
  | 'command/registered'
  /** La extensión publicó HTML para su webview. */
  | 'view/html'
  /** La extensión cambió el título de su vista. */
  | 'view/title'
  /** La extensión hizo `webview.postMessage` → al iframe. */
  | 'view/post'
  /** La extensión publicó los nodos RAÍZ de un árbol (snapshot). */
  | 'view/tree'
  /**
   * El provider pidió refrescar (`onDidChangeTreeData`). `elementId` undefined
   * = toda la vista; si viene, sólo ese nodo y su subárbol.
   */
  | 'view/tree-change'
  /**
   * La extensión creó/actualizó/quitó un item de la barra de estado
   * (`window.createStatusBarItem`). El renderer lo pinta de verdad.
   */
  | 'status/item'
  /** La extensión abrió un panel de webview en el área del editor. */
  | 'panel/open'
  /** El panel de webview cambió su título o su contenido. */
  | 'panel/update'
  /** La extensión cerró su panel de webview. */
  | 'panel/close'
  /**
   * La extensión publicó/limpió diagnósticos (`createDiagnosticCollection`).
   * El IDE los pinta (panel de Problemas + chip de la barra de estado); antes
   * se guardaban en el host y morían ahí.
   */
  | 'diagnostics/change'
  /**
   * La extensión subrayó rangos con `editor.setDecorations(...)`. El IDE los
   * dibuja DENTRO del texto (canal de subrayados del motor), no en una lista
   * aparte: sin esto la extensión pintaba y no se veía nada.
   */
  | 'decorations/set'
  /** Error fatal del host (se reporta y se apaga). */
  | 'fatal'

// ── Payloads ──────────────────────────────────────────────────────────────

export interface HostInitParams {
  extensionId: string
  /** Directorio absoluto del paquete instalado. */
  extensionPath: string
  /** Entry relativo al paquete (ej. `runtime/extension.js`). */
  entry: string
  /** Roots del workspace abierto (jail del filesystem). */
  workspaceRoots: string[]
  /** Permisos declarados en el manifest (deny-by-default). */
  permissions: string[]
  /** Modo de aislamiento elegido por el usuario para esta extensión. */
  mode: ExtensionHostMode
  /**
   * Defaults de `contributes.configuration` ya aplanados. Los calcula el main
   * (que ya leyó el manifest) para que el host no toque el disco por su cuenta.
   */
  configurationDefaults?: Record<string, unknown>
  /**
   * Estado inicial del editor: los documentos abiertos y cuál está activo.
   * Va en `init` para que la extensión los vea en `activate()` y no tenga que
   * esperar a que el usuario toque algo (una extensión que cuenta anclas
   * quiere el archivo abierto YA). El main mantiene este snapshot vivo.
   */
  documents?: DocumentEvent[]
  /** Directorios PROPIOS de la extensión, ya creados por el main. */
  storage?: ExtensionStoragePaths
  /** `context.globalState` al arrancar (persistido por el main). */
  globalState?: Record<string, unknown>
  /** `context.workspaceState` al arrancar. */
  workspaceState?: Record<string, unknown>
  /** `package.json` del paquete instalado (`context.extension.packageJSON`). */
  packageJSON?: Record<string, unknown>
  /**
   * El entry es ESM (`type: "module"` o `.mjs` y no `.cjs`): se carga con
   * `import()`, como VS Code (`_isESM` en `extHostExtensionService.ts`).
   */
  esm?: boolean
  /** Entorno del IDE (`env`). */
  env?: ExtensionEnvInfo
  /** Ajustes que la extensión persistió antes (`getConfiguration().get`). */
  configurationValues?: Record<string, unknown>
}

/**
 * Modo de ejecución elegido por el usuario (ajuste por extensión):
 * - `strict`: nada llega al host salvo lo que la extensión pide y el main
 *   autoriza caso por caso (fs enjaulado, sin shell, sin red).
 * - `compat`: se relajan los límites para que extensiones que asumen un
 *   runtime completo (bundles con `node_modules`, `process`…) arranquen.
 *   Sigue sin acceso al renderer ni a Electron.
 */
export type ExtensionHostMode = 'strict' | 'compat'

/**
 * Métodos que el HOST invoca en el main (ids negativos). El main es quien
 * autoriza: el host nunca toca el disco ni la UI por su cuenta.
 */
export type HostToMainMethod =
  /** Notificación con acciones; la respuesta trae el índice elegido. */
  | 'notify'
  /** Lee un archivo del workspace (jail + permisos en el main). */
  | 'fs/read'
  /** Escribe un archivo del workspace (jail + permisos en el main). */
  | 'fs/write'
  /** `stat` (tipo, tiempos, tamaño). */
  | 'fs/stat'
  /** `readDirectory`: `[nombre, tipo][]`. */
  | 'fs/read-directory'
  /** `createDirectory` (recursivo). */
  | 'fs/create-directory'
  /** `delete` (archivo o carpeta). */
  | 'fs/delete'
  /** `rename` (mismo dispositivo: el caso normal de una extensión). */
  | 'fs/rename'
  /** `copy`. */
  | 'fs/copy'
  /** Persiste un valor de `globalState` / `workspaceState`. */
  | 'state/write'
  /** `SecretStorage.get`. */
  | 'secrets/get'
  /** `SecretStorage.store`. */
  | 'secrets/store'
  /** `SecretStorage.delete`. */
  | 'secrets/delete'
  /** Persiste un ajuste que la extensión cambió (`getConfiguration().update`). */
  | 'configuration/write'
  /** Ejecuta un comando del IDE (registry real, no del host). */
  | 'command/execute'
  /** Busca archivos del workspace (el main camina el disco y respeta el jail). */
  | 'workspace/find'
  /** Pide al IDE abrir un archivo en el editor (registry real de la UI). */
  | 'editor/open'
  /** Abre un link o archivo con el sistema operativo (`env.openExternal`). */
  | 'host/open-external'

/**
 * Eventos que el MAIN emite hacia el HOST (el reverso de `HostEvent`).
 *
 * Son NOTIFICACIONES (sin respuesta) porque describen hechos de la UI que al
 * host sólo le queda reflejar: qué documentos están abiertos, cuál está
 * activo, qué partes del workspace cambiaron. Si el host está apagado no hay
 * a quién avisarle, y al encenderse recibe el snapshot completo en `init`.
 */
export type MainEvent =
  /**
   * El usuario cambió el ajuste de telemetría. El host lo refleja en
   * `env.isTelemetryEnabled` y dispara `onDidChangeTelemetryEnabled`.
   */
  | 'env/telemetry'
  /** Se abrió (o se activó por primera vez) un documento del editor. */
  | 'doc/open'
  /** El buffer cambió. Llega con el texto completo y la versión nueva. */
  | 'doc/change'
  /** Se cerró una tab: el documento sale de `workspace.textDocuments`. */
  | 'doc/close'
  /** El documento se guardó en disco. */
  | 'doc/save'
  /** Cambió el documento activo (o ninguno: `path: null`). */
  | 'doc/active'

/** Respuesta de `notify`: índice del botón elegido, o undefined si se cerró. */
export interface NotifyResult {
  actionIndex?: number
}

/** Resultado de una operación de filesystem resuelta por el main. */
export interface FsResultLike<T = string> {
  success: boolean
  value?: T
  error?: string
}

/** Tipo de archivo (`vscode.FileType`: 0 desconocido, 1 archivo, 2 carpeta, 64 symlink). */
export type FileTypeModel = 0 | 1 | 2 | 64

/** `vscode.FileStat` serializado. */
export interface FileStatModel {
  type: FileTypeModel
  ctime: number
  mtime: number
  size: number
}

export interface FsStatResult {
  success: boolean
  stat?: FileStatModel
  error?: string
}

export interface FsReadDirectoryResult {
  success: boolean
  entries?: Array<[string, FileTypeModel]>
  error?: string
}

/**
 * Rutas que el main le da a la extensión como PROPIAS.
 *
 * Van en `init` (no se piden) porque VS Code garantiza que existen ANTES de
 * `activate`: hay extensiones que en la primera línea escriben en su storage.
 */
export interface ExtensionStoragePaths {
  /** `context.globalStorageUri` (por extensión, entre workspaces). */
  globalStorage: string
  /** `context.storageUri` (por extensión y workspace). */
  workspaceStorage: string
  /** `context.logUri`. */
  logs: string
}

/** Lo que el main sabe del entorno y el shim expone como `env`. */
export interface ExtensionEnvInfo {
  /** Directorio de instalación del IDE (`env.appRoot`). */
  appRoot: string
  /** Id de máquina estable (`env.machineId`). */
  machineId: string
  /** Idioma de la UI (`env.language`). */
  language: string
  /** Esquema de URI de la app (`env.uriScheme`). */
  uriScheme: string
  /** `env.appName`. */
  appName: string
  /**
   * ¿El usuario habilitó la telemetría del IDE? Es el valor REAL del ajuste
   * (`env.isTelemetryEnabled`), no un `false` fijo: una extensión decide si
   * manda sus datos mirando esto, y mentirle es tomar esa decisión por ella.
   */
  isTelemetryEnabled?: boolean
  /**
   * Shell del sistema (`env.shell`). Una extensión lo usa para ofrecer su
   * integración de shell; en el IDE es informativo (no se escribe nada).
   */
  shell?: string
}

export interface CommandRegisteredPayload {
  id: string
  registered: boolean
}

export interface ViewHtmlPayload {
  viewId: string
  html: string
}

export interface ViewTitlePayload {
  viewId: string
  title: string
}

export interface ViewPostPayload {
  viewId: string
  message: unknown
}

// ── Árboles (tree data providers) ─────────────────────────────────────────

/**
 * Un nodo del árbol, ya SERIALIZADO para el renderer.
 *
 * El `id` es opaco para la UI: lo arma el host (`claveDelPadre#idLocal`) para
 * poder volver al elemento original en memoria. Por eso el renderer nunca
 * manda argumentos de comando: pide `tree/select` con el id del nodo y el
 * host corre el comando con los argumentos REALES (un `Uri` no sobrevive a
 * la serialización, y las extensiones lo esperan intacto).
 */
export interface TreeNodeModel {
  /** Id opaco (único dentro de la vista). */
  id: string
  label: string
  description?: string
  tooltip?: string
  /** `TreeItemCollapsibleState`: 0 = hoja, 1 = colapsado, 2 = expandido. */
  collapsible: 0 | 1 | 2
  contextValue?: string
  /** Icono: asset del paquete (URL servible) o ThemeIcon (id de codicon). */
  icon?: { kind: 'url'; url: string } | { kind: 'theme'; id: string }
  /**
   * Id del comando del item, SÓLO informativo (la fila se pinta clickeable).
   * Los argumentos no viajan: `tree/select` los recupera del elemento real.
   */
  command?: string
}

export interface ViewTreePayload {
  viewId: string
  nodes: TreeNodeModel[]
}

export interface ViewTreeChangePayload {
  viewId: string
  /** Sin `elementId`, cambió la raíz (refresh completo). */
  elementId?: string
}

export interface TreeChildrenParams {
  viewId: string
  /** `null` = raíz. */
  elementId: string | null
}

export interface TreeChildrenResult {
  nodes: TreeNodeModel[]
}

export interface TreeSelectParams {
  viewId: string
  elementId: string
}

export interface NotifyPayload {
  title: string
  message: string
  severity: 'info' | 'warning' | 'error'
  /**
   * Texto secundario (`MessageOptions.detail`).
   *
   * No es decorativo: Cline pide confirmaciones de varias líneas con
   * `showInformationMessage(msg, { modal: true, detail })` y ese objeto llegó a
   * viajar como si fuera la etiqueta de un botón, lo que hizo que la UI
   * intentara renderizar un objeto como texto (crash del renderer).
   */
  detail?: string
  /** `MessageOptions.modal`: la UI no la deja irse sola. */
  modal?: boolean
  /** Etiquetas de acciones (máx. 3). El host recibe la elegida por índice. */
  actions?: string[]
}

// ── Documentos del editor (renderer → main → host) ────────────────────────

/**
 * Un documento del editor tal como lo ve el host.
 *
 * El renderer manda el TEXTO COMPLETO en cada cambio (no diffs): el editor es
 * una sesión WASM aislada por archivo y extraer un diff incremental de ahí no
 * es gratis, mientras que el texto ya se lee para el LSP. El host lo usa para
 * construir un `TextDocument` de verdad (`getText`, `lineAt`, `offsetAt`…).
 */
export interface DocumentSnapshot {
  /** Ruta absoluta en disco (`uri.fsPath`). */
  path: string
  /** Lenguaje detectado por el IDE (evita que cada extensión lo adivine). */
  languageId: string
  /** Texto completo del buffer. */
  text: string
  /** Versión monótona por documento (los cambios llegan en orden). */
  version: number
  /** ¿Tiene cambios sin guardar? */
  dirty: boolean
  /** Fin de línea detectado (`\n` por defecto). */
  eol: '\n' | '\r\n'
}

/** Evento de sincronización de documentos: uno por documento y por hecho. */
export type DocumentEvent =
  | { kind: 'open'; document: DocumentSnapshot }
  | { kind: 'change'; document: DocumentSnapshot }
  | { kind: 'close'; path: string }
  | { kind: 'save'; path: string; version: number }
  | { kind: 'active'; path: string | null; selection?: DocumentSelection }

export interface DocumentSelection {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

/** Sinónimo explícito para hablar del lote que manda el renderer. */
export type DocumentSyncMessage = DocumentEvent[]

/** Resultado de `workspace/find`: rutas absolutas (ya pasaron el jail). */
export interface FindFilesResult {
  paths: string[]
  /** Se cortó por el tope de resultados (el host debe avisar, no mentir). */
  truncated: boolean
  error?: string
}

// ── Barra de estado (host → main → renderer) ──────────────────────────────

/**
 * Un item de la barra de estado, ya serializado para la UI.
 *
 * `null` desde `window.createStatusBarItem` = el item no tiene id propio y lo
 * identifica el host (ver `statusBar.ts`); el `id` de aquí es el que usa la UI
 * para actualizarlo o quitarlo.
 */
export interface StatusBarItemModel {
  /** Id único dentro del IDE (`<extensionId>#<n>`). */
  id: string
  extensionId: string
  alignment: 'left' | 'right'
  priority: number
  text: string
  tooltip?: string
  /** Comando que se corre al clickear (ruta real por el registry del IDE). */
  command?: string
  /** Color del texto (id de `ThemeColor` del tema, si la extensión lo pidió). */
  color?: string
  backgroundColor?: string
  name?: string
  /** `false` mientras no se llamó `show()`. */
  visible: boolean
  /** Codicon a la izquierda del texto (`$(bug)` en el `text` de VS Code). */
  icon?: string
}

/** Payload de `status/item`: `null` = quitar ese id. */
export type StatusBarItemPayload = StatusBarItemModel | { id: string; removed: true }

// ── Diagnósticos de extensiones (host → main → renderer) ─────────────────

/**
 * Diagnósticos que la extensión publicó, listos para pintar.
 *
 * La forma es EXACTAMENTE la del LSP (`LspDiagnostic`: severidad 1..4, rango
 * 0-based) porque es el mismo concepto y así la UI tiene UNA sola forma de
 * problema, venga de un language server o de una extensión. La conversión
 * desde `vscode.Diagnostic` (severidad 0..3) la hace el host al serializar.
 */
// ── Decoraciones de editor (host → main → renderer) ─────────────────────

/**
 * Un tramo que una extensión pidió subrayar (`editor.setDecorations`).
 *
 * El HOST ya tradujo la cadena «CSS» de VS Code (`'underline wavy red'`) a
 * estilo + color: la UI recibe datos, no una cadena que tenga que volver a
 * interpretar (misma regla que la severidad de los diagnósticos).
 */
export interface HostDecoration {
  startLine: number
  startCol: number
  endLine: number
  endCol: number
  /** 0 ondulada (default) · 1 recta · 2 punteada · 3 doble. */
  style: number
  /** 0xRRGGBBAA. Si falta, el IDE usa el color de decoración del tema. */
  color?: number
  /** `hoverMessage` de la decoración (el IDE lo muestra al apuntar). */
  message?: string
}

/**
 * Estado completo de las decoraciones de una extensión.
 *
 * Igual que los diagnósticos: van los archivos TOCADOS (incluidos los que
 * quedaron sin rangos), porque `decorations: []` es el hecho que borra lo que
 * la extensión había pintado. Mandar sólo los no-vacíos dejaría subrayados
 * fantasma de una extensión que ya limpió su estado.
 */
export interface ExtensionDecorationsPayload {
  entries: Array<{ path: string; decorations: HostDecoration[] }>
}

export interface ExtensionDiagnosticsPayload {
  /**
   * Una entrada por archivo TOCADO (incluye los vacíos): `diagnostics: []` es
   * un hecho, no un silencio — significa "este archivo ya no tiene problemas"
   * y la UI tiene que limpiar lo que mostraba.
   */
  entries: Array<{ path: string; diagnostics: LspDiagnostic[] }>
}

// ── Paneles de webview en el área del editor (host → main → renderer) ─────

/**
 * Un panel de webview (`window.createWebviewPanel`) ya serializado.
 *
 * El HTML no viaja por aca: se sirve por `scrakk-ext://<ext>/panel/<id>`, igual
 * que las vistas de la activity bar (mismo protocolo, mismo CSP, mismos
 * assets del paquete). El renderer sólo abre una tab con ese iframe.
 */
export interface WebviewPanelModel {
  /** Id único dentro del IDE (`panel:<extensionId>#<n>`). */
  id: string
  extensionId: string
  title: string
  /** Columna del editor pedida (`ViewColumn`); el IDE la usa como sugerencia. */
  viewColumn: number
  /** `visible` de la extensión: si se oculta, la tab se cierra. */
  visible: boolean
  /** Tiene HTML publicado (si no, el panel muestra "todavía no publicó"). */
  hasHtml: boolean
}

/** Payload de `panel/update`. */
export interface WebviewPanelUpdatePayload {
  id: string
  title?: string
  visible?: boolean
  hasHtml?: boolean
}

// ── Estado, secretos y ajustes (host → main) ──────────────────────────────

/** Álmacén de un memento (`context.globalState` / `workspaceState`). */
export type MementoScope = 'global' | 'workspace'

export interface StateWriteRequest {
  scope: MementoScope
  key: string
  /** `undefined` borra la clave (misma semántica que el API de VS Code). */
  value: unknown
}

export interface SecretsRequest {
  key: string
}

export interface SecretsStoreRequest {
  key: string
  value: string
}

export interface SecretsGetResult {
  success: boolean
  value?: string
  error?: string
}

/** Ajuste que la extensión pidió persistir (`getConfiguration().update`). */
export interface ConfigurationWriteRequest {
  section: string
  value: unknown
  /** `ConfigurationTarget`: 1 global, 2 workspace. */
  target?: number
}

export interface LogPayload {
  level: 'log' | 'info' | 'warn' | 'error'
  message: string
}

export interface FatalPayload {
  message: string
  stack?: string
}

// ── Vista (metadatos declarativos) ────────────────────────────────────────

/**
 * Una vista aportada por la extensión. El renderer la pinta SÓLO con esta
 * metadata; el contenido llega después, cuando el host resuelve el provider.
 */
export interface ExtensionViewDescriptor {
  /** `contributes.views.<container>[].id` — id global (ej. `foo.chat`). */
  id: string
  /** Nombre mostrado en el header de la vista. */
  name: string
  /** Id del contenedor (`viewsContainers.activitybar[].id`). */
  container: string
  /**
   * Cómo obtiene su contenido:
   * - `webview`: la extensión publica HTML (iframe aislado). Es el caso de
   *   los paneles tipo chat con IA.
   * - `tree`: la extensión sirve un tree data provider (`registerTreeDataProvider`
   *   / `createTreeView`) y el IDE pinta los nodos.
   */
  type: 'webview' | 'tree'
}

/** Un contenedor de la activity bar aportado por la extensión. */
export interface ExtensionViewContainer {
  id: string
  title: string
  /** Nombre de codicon (`$(name)`) o ruta de icono del paquete. */
  icon?: string
}
