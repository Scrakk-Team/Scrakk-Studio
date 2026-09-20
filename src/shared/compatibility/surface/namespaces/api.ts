/**
 * Namespaces del API del host — lo que ve el código de una extensión.
 *
 * Una entrada por miembro REAL del módulo `vscode` que se inyecta en el
 * Extension Host (medido, no supuesto: el audit de `registry.ts` recorre el
 * api en runtime y falla si aparece algo sin declarar aquí).
 *
 * Los grupos (clases de datos y enums) van en UNA entrada con `covers`: así
 * la tabla es legible y el audit sigue siendo exacto, nombre por nombre.
 */

import type { SurfaceEntry, SurfaceNamespace } from '../types'

const real = (key: string, label: string, extra: Partial<SurfaceEntry> = {}): SurfaceEntry => ({
  key,
  label,
  route: 'host',
  status: 'real',
  ...extra
})

const partial = (key: string, label: string, degradation: string, extra: Partial<SurfaceEntry> = {}): SurfaceEntry => ({
  key,
  label,
  route: 'host',
  status: 'partial',
  degradation,
  ...extra
})

const inert = (key: string, label: string, degradation: string, extra: Partial<SurfaceEntry> = {}): SurfaceEntry => ({
  key,
  label,
  route: 'host',
  status: 'inert',
  degradation,
  ...extra
})

const missing = (key: string, label: string, degradation: string): SurfaceEntry => ({
  key,
  label,
  route: 'host',
  status: 'missing',
  degradation
})

const NOT_PAINTED = 'lo que el editor todavía no pinta: la extensión no se entera, pero no se ve'

export const commandsNamespace: SurfaceNamespace = {
  id: 'commands',
  label: 'Comandos',
  apis: [
    real('executeCommand', 'Ejecutar comando', {
      native: 'commandRegistry del IDE',
      note: 'los built-in del IDE se resuelven sin pasar por la UI'
    }),
    real('registerCommand', 'Registrar comando'),
    real('registerTextEditorCommand', 'Registrar comando de editor'),
    real('getCommands', 'Listar comandos')
  ]
}

export const windowNamespace: SurfaceNamespace = {
  id: 'window',
  label: 'Ventana, notificaciones y paneles',
  apis: [
    real('showInformationMessage', 'Notificación informativa'),
    real('showWarningMessage', 'Notificación de advertencia'),
    real('showErrorMessage', 'Notificación de error'),
    real('showTextDocument', 'Abrir documento en el editor'),
    real('createStatusBarItem', 'Item en la barra de estado'),
    real('setStatusBarMessage', 'Mensaje temporal en la barra de estado'),
    real('registerWebviewViewProvider', 'Vista webview de la activity bar'),
    real('createWebviewPanel', 'Panel webview en el tab central'),
    real('registerTreeDataProvider', 'Árbol de la activity bar'),
    real('createTreeView', 'Árbol con vista propia'),
    real('registerUriHandler', 'Handler de URIs entrantes'),
    real('activeTextEditor', 'Editor activo'),
    real('visibleTextEditors', 'Editores visibles'),
    real('onDidChangeActiveTextEditor', 'Evento: cambia el editor activo'),
    real('onDidChangeVisibleTextEditors', 'Evento: cambian los editores visibles'),
    real('onDidChangeTextEditorSelection', 'Evento: cambia la selección'),
    real('onDidChangeTextEditorVisibleRanges', 'Evento: cambian los rangos visibles'),
    real('onDidChangeWindowState', 'Evento: cambia el estado de la ventana'),
    partial(
      'withProgress',
      'Progreso con título y mensaje',
      'la tarea corre de verdad, pero el IDE todavía no muestra la barra de progreso'
    ),
    partial(
      'createDiagnosticCollection',
      'Colección de diagnósticos',
      'los diagnósticos se guardan y el IDE los lista (panel de Problemas + chip de la barra de estado); el subrayado en el editor (canvas de Innerta) todavía no'
    ),
    partial(
      'createOutputChannel',
      'Canal de salida',
      'el canal escribe al log del host; todavía no hay panel de Salida que lo muestre'
    ),
    partial(
      'tabGroups',
      'Grupos de tabs',
      'expone la tab activa, pero no permite operar sobre los grupos'
    ),
    inert('createFileSystemWatcher', 'Watcher de archivos', 'el watcher se crea pero nunca emite'),
    real(
      'createTextEditorDecorationType',
      'Tipo de decoración',
      {
        native: 'canal de subrayados del motor (wavy/underline/dotted/double + color)',
        note: "se pinta el SUBRAYADO; el color de texto, el borde y el ruler del tipo se ignoran (el motor aún no los dibuja)"
      }
    ),
    inert(
      'onDidChangeActiveColorTheme',
      'Evento: cambia el tema de color',
      'nunca emite: el tema cambia por el sistema de temas del IDE'
    ),
    missing('showQuickPick', 'Selector rápido', 'el IDE todavía no expone un picker a las extensiones'),
    missing('showInputBox', 'Campo de entrada', 'el IDE todavía no expone un input a las extensiones')
  ]
}

export const workspaceNamespace: SurfaceNamespace = {
  id: 'workspace',
  label: 'Workspace, archivos y configuración',
  apis: [
    real('fs', 'API de archivos (readFile/writeFile/stat/readDirectory/createDirectory/delete/rename/copy)', {
      native: 'jail de paths del main'
    }),
    real('findFiles', 'Buscar archivos por glob'),
    real('getConfiguration', 'Leer configuración (defaults + valores persistidos)'),
    real('textDocuments', 'Documentos de texto abiertos'),
    real('openTextDocument', 'Abrir documento por ruta'),
    real('onDidOpenTextDocument', 'Evento: se abre un documento'),
    real('onDidChangeTextDocument', 'Evento: cambia un documento'),
    real('onDidCloseTextDocument', 'Evento: se cierra un documento'),
    real('onDidSaveTextDocument', 'Evento: se guarda un documento'),
    real('registerTextDocumentContentProvider', 'Documentos virtuales (esquemas propios)'),
    real('asRelativePath', 'Ruta relativa al workspace'),
    real('getWorkspaceFolder', 'Carpeta del workspace de una ruta'),
    real('workspaceFolders', 'Carpetas del workspace'),
    real('rootPath', 'Ruta raíz (legacy)'),
    inert('createFileSystemWatcher', 'Watcher de archivos', 'el watcher se crea pero nunca emite'),
    inert('onDidChangeConfiguration', 'Evento: cambia la configuración', 'nunca emite'),
    inert('onDidChangeWorkspaceFolders', 'Evento: cambian las carpetas', 'nunca emite'),
    inert('onWillSaveTextDocument', 'Evento: antes de guardar', NOT_PAINTED),
    inert('onDidCreateFiles', 'Evento: se crean archivos', 'el IDE todavía no lo emite'),
    inert('onDidDeleteFiles', 'Evento: se borran archivos', 'el IDE todavía no lo emite'),
    inert('onDidRenameFiles', 'Evento: se renombran archivos', 'el IDE todavía no lo emite'),
    inert('onWillCreateFiles', 'Evento: antes de crear archivos', 'el IDE todavía no lo emite'),
    inert('onWillDeleteFiles', 'Evento: antes de borrar archivos', 'el IDE todavía no lo emite'),
    inert('onWillRenameFiles', 'Evento: antes de renombrar', 'el IDE todavía no lo emite'),
    missing(
      'applyEdit',
      'Editar archivos desde la extensión',
      'necesita el canal host → editor (Innerta); hoy falla con error claro'
    )
  ]
}

/**
 * Proveedores de lenguaje CONSULTABLES: el host los registra de verdad y el
 * IDE pregunta por `provider/query` (ver `languageProviders.ts` del host).
 *
 * Los tres primeros ya se VEN (el hover, el ir a la definición y el formatear
 * del menú contextual los pintan); los demás tienen respuesta pero todavía no
 * tienen UI que la muestre. Los dos grupos son distintos y la tabla no los
 * mezcla: decir "real" de un resultado que nadie dibuja sería mentir.
 */
const CONSULTED_PROVIDERS: Array<[string, string]> = [
  ['registerHoverProvider', 'Hover'],
  ['registerDefinitionProvider', 'Ir a definición'],
  ['registerDocumentFormattingEditProvider', 'Formateo completo']
]

const ANSWERED_PROVIDERS: Array<[string, string]> = [
  ['registerDeclarationProvider', 'Ir a declaración'],
  ['registerTypeDefinitionProvider', 'Ir a tipo'],
  ['registerImplementationProvider', 'Ir a implementación'],
  ['registerReferenceProvider', 'Referencias'],
  ['registerDocumentHighlightProvider', 'Resaltado de ocurrencias'],
  ['registerDocumentRangeFormattingEditProvider', 'Formateo de rango']
]

/** Se registran sin romper el `activate`, pero el editor no los consulta aún. */
const LANGUAGE_PROVIDERS: Array<[string, string]> = [
  ['registerCompletionItemProvider', 'Autocompletado'],
  ['registerDocumentSymbolProvider', 'Símbolos del documento'],
  ['registerWorkspaceSymbolProvider', 'Símbolos del workspace'],
  ['registerDocumentLinkProvider', 'Links del documento'],
  ['registerCodeLensProvider', 'Code lens'],
  ['registerCodeActionsProvider', 'Acciones de código'],
  ['registerRenameProvider', 'Renombrar'],
  ['registerSignatureHelpProvider', 'Ayuda de firma'],
  ['registerFoldingRangeProvider', 'Rangos plegables'],
  ['registerSemanticTokensProvider', 'Tokens semánticos'],
  ['registerInlayHintsProvider', 'Inlay hints'],
  ['registerSelectionRangeProvider', 'Rangos de selección'],
  ['registerCallHierarchyProvider', 'Jerarquía de llamadas'],
  ['registerTypeHierarchyProvider', 'Jerarquía de tipos']
]

export const languagesNamespace: SurfaceNamespace = {
  id: 'languages',
  label: 'Lenguajes y diagnósticos',
  apis: [
    real('getDiagnostics', 'Leer diagnósticos'),
    real('onDidChangeDiagnostics', 'Evento: cambian los diagnósticos'),
    real('getLanguages', 'Lenguajes conocidos'),
    real('match', 'Selector de lenguaje de un documento'),
    real('setLanguageConfiguration', 'Configuración de lenguaje'),
    partial(
      'createDiagnosticCollection',
      'Colección de diagnósticos',
      'los diagnósticos se guardan y el IDE los lista (panel de Problemas + chip de la barra de estado); el subrayado en el editor (canvas de Innerta) todavía no'
    ),
    ...CONSULTED_PROVIDERS.map(([key, label]) =>
      real(key, `Proveedor de ${label}`, {
        note: 'la extensión lo registra y el IDE lo consulta (`provider/query`); el resultado se pinta'
      })
    ),
    ...ANSWERED_PROVIDERS.map(([key, label]) =>
      partial(
        key,
        `Proveedor de ${label}`,
        'se registra y el server responde, pero el editor todavía no muestra ese resultado'
      )
    ),
    ...LANGUAGE_PROVIDERS.map(([key, label]) =>
      inert(
        key,
        `Proveedor de ${label}`,
        'se registra, pero el IDE todavía no lo consulta (no hay UI para ese resultado)'
      )
    )
  ]
}

export const envNamespace: SurfaceNamespace = {
  id: 'env',
  label: 'Entorno del IDE',
  apis: [
    real('appHost', 'Host de la app (desktop)'),
    real('appName', 'Nombre de la app'),
    real('appRoot', 'Raíz de la instalación'),
    real('language', 'Idioma del IDE'),
    real('machineId', 'Id estable de la máquina'),
    real('openExternal', 'Abrir enlace externo'),
    real('remoteName', 'Nombre del remoto (undefined en local)'),
    real('sessionId', 'Id de la sesión'),
    real('uiKind', 'Tipo de UI (desktop)'),
    real('uriScheme', 'Esquema de URIs de la app'),
    real('version', 'Versión de la app'),
    real('isTelemetryEnabled', '¿La telemetría del IDE está activada?', {
      native: 'ajuste de Privacidad del IDE',
      note: 'el valor REAL viaja en el `init` del host y cambia en caliente (`env/telemetry`)'
    }),
    real('onDidChangeTelemetryEnabled', 'Cambió el ajuste de telemetría', {
      native: 'evento real del host',
      note: 'lo dispara el ajuste de Privacidad, no es un evento inerte'
    }),
    real('shell', 'Shell del sistema', {
      native: 'process.env.SHELL / ComSpec',
      note: 'undefined cuando no se puede saber (no se inventa un shell)'
    }),
    partial('asExternalUri', 'URI externa', 'devuelve la misma URI sin reescribirla'),
    partial('isNewAppInstall', '¿Es la primera ejecución?', 'hoy reporta siempre `false`')
  ]
}

/**
 * API del editor que la extensión toca a través de un `TextEditor`.
 * No es un namespace del módulo `vscode`: se declara igual porque es lo que
 * `unsupported()` necesita para explicarse.
 */
export const textEditorNamespace: SurfaceNamespace = {
  id: 'textEditor',
  label: 'Edición del buffer',
  apis: [
    missing(
      'edit',
      'Editar el buffer desde la extensión',
      'necesita el canal host → editor (Innerta); hoy falla con error claro'
    ),
    real('setDecorations', 'Pintar rangos en el editor', {
      native: 'canal de subrayados del motor (mismo que los diagnósticos)',
      note: 'los `renderOptions` por rango (color propio) hoy usan el color del tipo'
    })
  ]
}

export const extensionsNamespace: SurfaceNamespace = {
  id: 'extensions',
  label: 'Registro de extensiones',
  apis: [
    inert('getExtension', 'Obtener una extensión', 'hoy devuelve `undefined`'),
    inert('all', 'Todas las extensiones', 'hoy devuelve una lista vacía'),
    inert('onDidChange', 'Evento: cambian las extensiones', 'nunca emite')
  ]
}

/**
 * Primitivas y portadoras de datos. Las que tienen comportamiento (Uri,
 * Position, Range, EventEmitter…) son `real`; las que la extensión solo
 * construye van en dos grupos con `covers`, porque existen para que su código
 * no reviente al cargar y no para que el editor las consuma.
 */
export const coreNamespace: SurfaceNamespace = {
  id: 'core',
  label: 'Tipos y valores base',
  apis: [
    real('Uri', 'URI'),
    real('Position', 'Posición'),
    real('Range', 'Rango'),
    real('Selection', 'Selección'),
    real('TextLine', 'Línea de texto'),
    real('FileStat', 'Stat de archivo'),
    real('RelativePattern', 'Patrón relativo'),
    real('CancellationTokenSource', 'Token de cancelación'),
    real('CancellationError', 'Error de cancelación (lo lanza el cliente LSP real)'),
    real('EventEmitter', 'Emisor de eventos'),
    real('Disposable', 'Recurso descartable'),
    real('MarkdownString', 'String con markdown'),
    real('MessageItem', 'Item de mensaje'),
    real('ThemeColor', 'Color del tema'),
    real('ThemeIcon', 'Icono del tema'),
    real('TreeItem', 'Item de árbol'),
    real('TreeItemCollapsibleState', 'Estado de plegado'),
    real('version', 'Versión del API'),
    {
      key: 'l10n',
      label: 'Traducciones de la extensión (`l10n.t`)',
      route: 'host',
      status: 'partial',
      covers: ['t'],
      native: 'mensaje original con sus argumentos',
      degradation:
        'Scrakk todavía no lee los bundles `l10n/*` de la extensión: los textos salen en el idioma base con los placeholders ya sustituidos (nunca un `{0}` en pantalla)'
    },
    {
      key: 'dataClasses.*',
      label: 'Clases de datos (Diagnostic, TextEdit, Hover…)',
      route: 'host',
      status: 'real',
      covers: [
        'CallHierarchyIncomingCall',
        'CallHierarchyItem',
        'CallHierarchyOutgoingCall',
        'CodeAction',
        'CodeLens',
        'CompletionItem',
        'CompletionList',
        'Diagnostic',
        'DiagnosticRelatedInformation',
        'DocumentLink',
        'DocumentSymbol',
        'EvaluationResult',
        'FoldingRange',
        'Hover',
        'InlayHint',
        'Location',
        'SelectionRange',
        'SemanticTokens',
        'SemanticTokensBuilder',
        'SemanticTokensEdit',
        'SemanticTokensLegend',
        'SnippetString',
        'SymbolInformation',
        'TextEdit',
        'TypeHierarchyIncomingCall',
        'TypeHierarchyItem',
        'TypeHierarchyOutgoingCall',
        'WorkspaceEdit'
      ],
      note: 'existen para que la extensión pueda CONSTRUIR lo que devuelve; el editor las consume cuando la feature esté'
    },
    {
      key: 'enums.*',
      label: 'Enums del API (SymbolKind, DiagnosticSeverity, ViewColumn…)',
      route: 'host',
      status: 'real',
      covers: [
        'CodeActionKind',
        'CodeActionTriggerKind',
        'CommentMode',
        'CommentThreadCollapsibleState',
        'CommentThreadState',
        'CompletionItemKind',
        'CompletionTriggerKind',
        'ConfigurationTarget',
        'DecorationRangeBehavior',
        'DiagnosticSeverity',
        'DiagnosticTag',
        'DocumentHighlightKind',
        'EndOfLine',
        'ExtensionKind',
        'ExtensionMode',
        'FileChangeType',
        'FilePermission',
        'FileType',
        'FoldingRangeKind',
        'InlayHintKind',
        'LanguageStatusSeverity',
        'NotebookCellExecutionState',
        'NotebookCellKind',
        'NotebookCellStatusBarAlignment',
        'OverviewRulerLane',
        'ProgressLocation',
        'QuickPickItemKind',
        'SignatureHelpTriggerKind',
        'StatusBarAlignment',
        'SymbolKind',
        'SymbolTag',
        'TaskPanelKind',
        'TaskRevealKind',
        'TaskScope',
        'TerminalLocation',
        'TextEditorCursorStyle',
        'TextEditorLineNumbersStyle',
        'TextEditorRevealType',
        'TextEditorSelectionChangeKind',
        'TreeItemCheckboxState',
        'UIKind',
        'ViewColumn'
      ],
      note: 'los inicializadores estáticos del bundle leen estos valores al cargar: si faltara uno, la extensión no llegaría ni a activar'
    }
  ]
}

/** Namespaces del API del host, en orden de aparición en la tabla. */
export const API_NAMESPACES: SurfaceNamespace[] = [
  commandsNamespace,
  windowNamespace,
  workspaceNamespace,
  languagesNamespace,
  envNamespace,
  extensionsNamespace,
  textEditorNamespace,
  coreNamespace
]
