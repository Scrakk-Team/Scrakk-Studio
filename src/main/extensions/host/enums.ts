/**
 * Enums y namespaces de constantes del API `vscode`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE ARCHIVO ES IMPORTANTE
 *
 * Las extensiones leen estas constantes en **inicializadores estáticos**, o sea
 * al CARGAR el módulo, no en un camino de error. Sin ellas, la extensión ni
 * siquiera termina de importarse: el `require` tira
 * `Cannot read properties of undefined (reading 'QuickFix')` y lo que se ve es
 * "la extensión no arranca" (así murió Cline, en la línea 8213 de su bundle).
 *
 * Los valores son los REALES de VS Code (`vscode.d.ts`). Importa que coincidan:
 * hay extensiones que los guardan en disco, los mandan a sus servidores o los
 * comparan con lo que devuelve el API. Un valor inventado sería una mentira que
 * se descubre lejos de acá.
 *
 * Lo que NO hay acá: nada de comportamiento. Son datos.
 */

// ── Enums numéricos ───────────────────────────────────────────────────────

export const StatusBarAlignment = { Left: 1, Right: 2 } as const

export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 } as const

export const ExtensionMode = { Production: 1, Development: 2, Test: 3 } as const

export const ExtensionKind = { UI: 1, Workspace: 2 } as const

export const ProgressLocation = { SourceControl: 1, Window: 10, Notification: 15 } as const

export const QuickPickItemKind = { Separator: -1, Default: 0 } as const

export const UIKind = { Desktop: 1, Web: 2 } as const

export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 } as const

export const FileChangeType = { Changed: 1, Created: 2, Deleted: 3 } as const

export const FilePermission = { Readonly: 1, Writeable: 2 } as const

export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 } as const

export const DiagnosticTag = { Unnecessary: 1, Deprecated: 2 } as const

export const CompletionTriggerKind = {
  Invoke: 0,
  TriggerCharacter: 1,
  TriggerForIncompleteCompletions: 2
} as const

export const CompletionItemKind = {
  Text: 0,
  Method: 1,
  Function: 2,
  Constructor: 3,
  Field: 4,
  Variable: 5,
  Class: 6,
  Interface: 7,
  Module: 8,
  Property: 9,
  Unit: 10,
  Value: 11,
  Enum: 12,
  Keyword: 13,
  Snippet: 14,
  Color: 15,
  File: 16,
  Reference: 17,
  Folder: 18,
  EnumMember: 19,
  Constant: 20,
  Struct: 21,
  Event: 22,
  Operator: 23,
  TypeParameter: 24,
  User: 25,
  Issue: 26
} as const

export const SymbolKind = {
  File: 0,
  Module: 1,
  Namespace: 2,
  Package: 3,
  Class: 4,
  Method: 5,
  Property: 6,
  Field: 7,
  Constructor: 8,
  Enum: 9,
  Interface: 10,
  Function: 11,
  Variable: 12,
  Constant: 13,
  String: 14,
  Number: 15,
  Boolean: 16,
  Array: 17,
  Object: 18,
  Key: 19,
  Null: 20,
  EnumMember: 21,
  Struct: 22,
  Event: 23,
  Operator: 24,
  TypeParameter: 25
} as const

export const SymbolTag = { Deprecated: 1 } as const

export const DocumentHighlightKind = { Text: 0, Read: 1, Write: 2 } as const

export const EndOfLine = { LF: 1, CRLF: 2 } as const

export const OverviewRulerLane = { Left: 1, Center: 2, Right: 4, Full: 7 } as const

export const DecorationRangeBehavior = {
  OpenOpen: 0,
  ClosedClosed: 1,
  OpenClosed: 2,
  ClosedOpen: 3
} as const

export const TextEditorRevealType = {
  Default: 0,
  InCenter: 1,
  InCenterIfOutsideViewport: 2,
  AtTop: 3
} as const

export const TextEditorSelectionChangeKind = { Keyboard: 1, Mouse: 2, Command: 3 } as const

export const TextEditorCursorStyle = {
  Line: 1,
  Block: 2,
  Underline: 3,
  LineThin: 4,
  BlockOutline: 5,
  UnderlineThin: 6
} as const

export const TextEditorLineNumbersStyle = { Off: 0, On: 1, Relative: 2 } as const

export const SignatureHelpTriggerKind = { Invoke: 1, TriggerCharacter: 2, ContentChange: 3 } as const

export const CodeActionTriggerKind = { Invoke: 1, Automatic: 2 } as const

export const InlayHintKind = { Type: 1, Parameter: 2 } as const

export const CommentMode = { Editing: 0, Preview: 1 } as const

export const CommentThreadCollapsibleState = { Collapsed: 0, Expanded: 1 } as const

export const CommentThreadState = { Unresolved: 0, Resolved: 1 } as const

export const TreeItemCheckboxState = { Unchecked: 0, Checked: 1 } as const

export const LanguageStatusSeverity = { Information: 0, Warning: 1, Error: 2 } as const

export const TerminalLocation = { Panel: 1, Editor: 2 } as const

export const TaskRevealKind = { Always: 1, Silent: 2, Never: 3 } as const

export const TaskScope = { Global: 1, Workspace: 2 } as const

export const NotebookCellKind = { Markup: 1, Code: 2 } as const

export const NotebookCellStatusBarAlignment = { Left: 1, Right: 2 } as const

export const NotebookCellExecutionState = { Idle: 1, Pending: 2, Executing: 3 } as const

export const TaskPanelKind = { Shared: 1, Dedicated: 2, New: 3 } as const

/** `CodeActionKind` es de strings (los usa LSP tal cual). */
export const CodeActionKind = {
  Empty: '',
  QuickFix: 'quickfix',
  Refactor: 'refactor',
  RefactorExtract: 'refactor.extract',
  RefactorInline: 'refactor.inline',
  RefactorRewrite: 'refactor.rewrite',
  Source: 'source',
  SourceOrganizeImports: 'source.organizeImports',
  SourceFixAll: 'source.fixAll',
  Notebook: 'notebook'
} as const

/** `FoldingRangeKind` también es de strings. */
export const FoldingRangeKind = {
  Comment: 'comment',
  Imports: 'imports',
  Region: 'region'
} as const
