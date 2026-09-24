// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Clases de DATOS del API `vscode` (las que las extensiones instancian).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ ES Y QUÉ NO ES ESTO
 *
 * Son portadoras de datos con la MISMA forma que las de VS Code, no imitaciones
 * de comportamiento: `new vscode.Diagnostic(range, mensaje)` se usa para
 * *construir* lo que la extensión devuelve, y si la clase no existe el
 * `new`/`instanceof` revienta al cargar su módulo o en medio de un provider.
 * Ninguna de estas clases toca el IDE, el disco ni la red: sólo guardan campos.
 *
 * Los constructores aceptan los argumentos REALES (`new Hover(contents, range?)`)
 * porque muchas extensiones guardan estas clases en `instanceof` o las
 * serializan; inventar una firma distinta rompería de formas difíciles de leer.
 */

import { Position, Range } from './textDocuments'
import type { Uri } from './vscodeShim'

/**
 * `Diagnostic`: lo que una extensión reporta como problema.
 * `severity` es opcional (default Error, como VS Code).
 */
export class Diagnostic {
  range: Range
  message: string
  severity: number
  source?: string
  code?: string | number | { value: string | number; target: Uri }
  relatedInformation?: DiagnosticRelatedInformation[]
  tags?: readonly number[]

  constructor(range: Range, message: string, severity: number = 0) {
    this.range = range
    this.message = message
    this.severity = severity
  }
}

export class DiagnosticRelatedInformation {
  constructor(
    readonly location: Location,
    readonly message: string
  ) {}
}

export class Location {
  constructor(
    readonly uri: Uri,
    readonly range: Range | Position
  ) {}
}

export class CodeLens {
  range: Range
  command?: CommandLike
  constructor(range: Range, command?: CommandLike) {
    this.range = range
    this.command = command
  }
}

export class CodeAction {
  title: string
  kind?: string
  diagnostics?: readonly Diagnostic[]
  edit?: WorkspaceEdit
  command?: CommandLike
  isPreferred?: boolean
  disabled?: { reason: string }
  constructor(title: string, kind?: string) {
    this.title = title
    this.kind = kind
  }
}

export interface CommandLike {
  title: string
  command: string
  arguments?: unknown[]
  tooltip?: string
}

export class CompletionItem {
  label: string | { label: string; description?: string }
  kind?: number
  detail?: string
  documentation?: string | MarkdownLike
  sortText?: string
  filterText?: string
  preselect?: boolean
  insertText?: string | SnippetString
  range?: Range | { inserting: Range; replacing: Range }
  commitCharacters?: readonly string[]
  additionalTextEdits?: readonly TextEdit[]
  constructor(label: string | { label: string; description?: string }, kind?: number) {
    this.label = label
    this.kind = kind
  }
}

export interface MarkdownLike {
  value: string
}

export class CompletionList {
  isIncomplete: boolean
  items: readonly CompletionItem[]
  constructor(items: readonly CompletionItem[] = [], isIncomplete = false) {
    this.items = items
    this.isIncomplete = isIncomplete
  }
}

export class SnippetString {
  value: string
  constructor(value = '') {
    this.value = value
  }
  appendText(text: string): SnippetString {
    this.value += text
    return this
  }
  appendPlaceholder(value: string | ((snippet: SnippetString) => unknown)): SnippetString {
    if (typeof value === 'string') this.value += `\${1:${value}}`
    return this
  }
  appendTabstop(number = 1): SnippetString {
    this.value += `$${number}`
    return this
  }
  appendVariable(): SnippetString {
    return this
  }
}

export class Hover {
  range?: Range
  constructor(
    readonly contents:
      | string
      | MarkdownLike
      | Array<string | MarkdownLike>,
    range?: Range
  ) {
    this.range = range
  }
}

export class DocumentLink {
  constructor(
    readonly range: Range,
    readonly target?: Uri,
    readonly tooltip?: string
  ) {}
}

export class TextEdit {
  constructor(
    readonly range: Range,
    readonly newText: string
  ) {}
}

/** `WorkspaceEdit` es un acumulador de ediciones (no toca nada hasta aplicarlo). */
export class WorkspaceEdit {
  private readonly edits = new Map<string, { uri: Uri; edits: readonly TextEdit[] }>()
  private readonly fileOps: Array<{ kind: string; from: Uri; to?: Uri; options?: unknown }> = []

  get size(): number {
    return this.edits.size + this.fileOps.length
  }

  has(uri: Uri): boolean {
    return this.edits.has(uri.toString())
  }

  set(uri: Uri, edits: readonly TextEdit[]): void {
    this.edits.set(uri.toString(), { uri, edits })
  }

  replace(uri: Uri, range: Range, newText: string): void {
    const key = uri.toString()
    const current = this.edits.get(key)?.edits ?? []
    this.edits.set(key, { uri, edits: [...current, new TextEdit(range, newText)] })
  }

  insert(uri: Uri, position: Position, newText: string): void {
    this.replace(uri, new Range(position, position), newText)
  }

  delete(uri: Uri, range: Range): void {
    this.replace(uri, range, '')
  }

  createFile(uri: Uri, options?: unknown): void {
    this.fileOps.push({ kind: 'create', from: uri, options })
  }

  renameFile(oldUri: Uri, newUri: Uri, options?: unknown): void {
    this.fileOps.push({ kind: 'rename', from: oldUri, to: newUri, options })
  }

  deleteFile(uri: Uri, options?: unknown): void {
    this.fileOps.push({ kind: 'delete', from: uri, options })
  }

  entries(): Array<{ uri: Uri; edits: readonly TextEdit[] }> {
    return [...this.edits.values()].map((entry) => ({ uri: entry.uri, edits: entry.edits }))
  }

  get(uri: Uri): readonly TextEdit[] {
    return this.edits.get(uri.toString())?.edits ?? []
  }
}

export class SymbolInformation {
  constructor(
    readonly name: string,
    readonly kind: number,
    readonly containerName: string,
    readonly location: Location
  ) {}
}

export class DocumentSymbol {
  children: DocumentSymbol[] = []
  constructor(
    readonly name: string,
    readonly detail: string,
    readonly kind: number,
    readonly range: Range,
    readonly selectionRange: Range
  ) {}
}

export class InlayHint {
  paddingLeft?: boolean
  paddingRight?: boolean
  constructor(
    readonly position: Position,
    readonly label: string | readonly { value: string }[],
    readonly kind?: number
  ) {}
}

export class CallHierarchyItem {
  constructor(
    readonly kind: number,
    readonly name: string,
    readonly detail: string,
    readonly uri: Uri,
    readonly range: Range,
    readonly selectionRange: Range
  ) {}
}

export class TypeHierarchyItem {
  constructor(
    readonly kind: number,
    readonly name: string,
    readonly detail: string,
    readonly uri: Uri,
    readonly range: Range,
    readonly selectionRange: Range
  ) {}
}

export class SemanticTokensLegend {
  constructor(
    readonly tokenTypes: readonly string[],
    readonly tokenModifiers: readonly string[] = []
  ) {}
}

export class SemanticTokens {
  resultId?: string
  constructor(readonly data: Uint32Array) {}
}

export class SemanticTokensEdit {
  constructor(
    readonly start: number,
    readonly deleteCount: number,
    readonly data?: Uint32Array
  ) {}
}

export class SemanticTokensBuilder {
  private readonly data: number[] = []
  push(line: number, char: number, length: number, tokenType: number, tokenModifiers = 0): void {
    this.data.push(line, char, length, tokenType, tokenModifiers)
  }
  build(resultId?: string): SemanticTokens {
    const tokens = new SemanticTokens(Uint32Array.from(this.data))
    if (resultId !== undefined) tokens.resultId = resultId
    return tokens
  }
}

export class SelectionRange {
  constructor(
    readonly range: Range,
    readonly parent?: SelectionRange
  ) {}
}

export class FoldingRange {
  constructor(
    readonly start: number,
    readonly end: number,
    readonly kind?: string
  ) {}
}

export class CallHierarchyIncomingCall {
  constructor(
    readonly from: CallHierarchyItem,
    readonly fromRanges: readonly Range[]
  ) {}
}

export class CallHierarchyOutgoingCall {
  constructor(
    readonly to: CallHierarchyItem,
    readonly fromRanges: readonly Range[]
  ) {}
}

export class TypeHierarchyIncomingCall {
  constructor(
    readonly from: TypeHierarchyItem,
    readonly fromRanges: readonly Range[]
  ) {}
}

export class TypeHierarchyOutgoingCall {
  constructor(
    readonly to: TypeHierarchyItem,
    readonly fromRanges: readonly Range[]
  ) {}
}

export class EvaluationResult {
  constructor(readonly expression: string) {}
}
