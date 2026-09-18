/**
 * Documentos del editor, de verdad.
 *
 * `workspace.textDocuments` y los eventos `onDidOpenTextDocument` /
 * `onDidChangeTextDocument` / `onDidCloseTextDocument` / `onDidSaveTextDocument`
 * son una de las cosas que MÁS usan las extensiones de paneles: un tree
 * provider que lista algo del archivo abierto, un linter, un contador de
 * anclas… sin documentos, la extensión activa pero no tiene qué mirar (ese era
 * el síntoma real: el árbol de Comment Anchors se quedaba en "Searching for
 * anchors…" para siempre).
 *
 * Quién manda el texto: el RENDERER (ver `services/extensions/documents.ts`).
 * El editor es una sesión WASM aislada por archivo y es la única que sabe qué
 * está pasando en el buffer; el host no lee el disco por su cuenta porque eso
 * mostraría versiones viejas (justo lo contrario de lo que la extensión quiere).
 *
 * Este archivo es Node puro (sin Electron ni stdio): se testea solo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * No sabe de dónde vienen los snapshots: los recibe por `apply()`. Si Owear
 * cambia el editor o el canal, se reescribe el emisor (renderer/IPC), no esto.
 */

import type {
  DocumentEvent,
  DocumentSelection,
  DocumentSnapshot,
  LogPayload
} from '@shared/extensionHost/protocol'
import { Uri } from './vscodeShim'

/**
 * Lenguaje de un archivo por su extensión.
 *
 * El IDE manda el lenguaje en cada snapshot (lo detecta su propio mapa de
 * lenguajes), así que esto es el fallback para documentos que la extensión
 * abre por su cuenta con `openTextDocument`.
 */
export function languageIdForPath(path: string): string {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? path
  const lower = name.toLowerCase()
  const byName: Record<string, string> = {
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    '.gitignore': 'ignore',
    '.env': 'dotenv'
  }
  if (byName[lower]) return byName[lower]
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''
  const byExt: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascriptreact',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    jsonc: 'jsonc',
    md: 'markdown',
    markdown: 'markdown',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sh: 'shellscript',
    bash: 'shellscript',
    zsh: 'shellscript',
    ps1: 'powershell',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    xml: 'xml',
    sql: 'sql',
    svg: 'xml',
    vue: 'vue',
    svelte: 'svelte',
    lua: 'lua',
    dart: 'dart',
    swift: 'swift',
    txt: 'plaintext'
  }
  return byExt[ext] ?? 'plaintext'
}

// ── Position / Range / Selection ──────────────────────────────────────────

export class Position {
  constructor(
    readonly line: number,
    readonly character: number
  ) {}

  isBefore(other: Position): boolean {
    return this.line < other.line || (this.line === other.line && this.character < other.character)
  }

  isBeforeOrEqual(other: Position): boolean {
    return this.isBefore(other) || this.isEqual(other)
  }

  isAfter(other: Position): boolean {
    return !this.isBeforeOrEqual(other)
  }

  isAfterOrEqual(other: Position): boolean {
    return !this.isBefore(other)
  }

  isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character
  }

  compareTo(other: Position): number {
    if (this.isBefore(other)) return -1
    return this.isEqual(other) ? 0 : 1
  }

  translate(lineDelta = 0, characterDelta = 0): Position {
    return new Position(this.line + lineDelta, this.character + characterDelta)
  }

  with(line = this.line, character = this.character): Position {
    return new Position(line, character)
  }

  toJSON(): { line: number; character: number } {
    return { line: this.line, character: this.character }
  }
}

export class Range {
  readonly start: Position
  readonly end: Position

  constructor(start: Position, end: Position)
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number)
  constructor(a: Position | number, b: Position | number, c?: number, d?: number) {
    if (typeof a === 'number') {
      this.start = new Position(a, b as number)
      this.end = new Position(c ?? a, d ?? (b as number))
    } else {
      const end = b as Position
      // Igual que VS Code: un rango con el fin ANTES del inicio se normaliza.
      this.start = end.isBefore(a) ? end : a
      this.end = end.isBefore(a) ? a : end
    }
  }

  get isEmpty(): boolean {
    return this.start.isEqual(this.end)
  }

  get isSingleLine(): boolean {
    return this.start.line === this.end.line
  }

  contains(positionOrRange: Position | Range): boolean {
    if (positionOrRange instanceof Range) {
      return this.contains(positionOrRange.start) && this.contains(positionOrRange.end)
    }
    return positionOrRange.isAfterOrEqual(this.start) && positionOrRange.isBeforeOrEqual(this.end)
  }

  isEqual(other: Range): boolean {
    return this.start.isEqual(other.start) && this.end.isEqual(other.end)
  }

  intersection(other: Range): Range | undefined {
    const start = this.start.isAfter(other.start) ? this.start : other.start
    const end = this.end.isBefore(other.end) ? this.end : other.end
    return start.isAfter(end) ? undefined : new Range(start, end)
  }

  union(other: Range): Range {
    const start = this.start.isBefore(other.start) ? this.start : other.start
    const end = this.end.isAfter(other.end) ? this.end : other.end
    return new Range(start, end)
  }

  with(start = this.start, end = this.end): Range {
    return new Range(start, end)
  }

  toJSON(): { start: Position; end: Position } {
    return { start: this.start, end: this.end }
  }
}

export class Selection extends Range {
  readonly anchor: Position
  readonly active: Position

  constructor(anchor: Position, active: Position)
  constructor(anchorLine: number, anchorCharacter: number, activeLine: number, activeCharacter: number)
  constructor(a: Position | number, b: Position | number, c?: number, d?: number) {
    const anchor = typeof a === 'number' ? new Position(a, b as number) : a
    const active = typeof a === 'number' ? new Position(c ?? a, d ?? (b as number)) : (b as Position)
    super(anchor, active)
    this.anchor = anchor
    this.active = active
  }

  get isReversed(): boolean {
    return this.active.isBefore(this.anchor)
  }
}

/** Contenido de una línea del documento. */
export class TextLine {
  constructor(
    readonly lineNumber: number,
    readonly text: string,
    private readonly eolLength: number
  ) {}

  get range(): Range {
    return new Range(this.lineNumber, 0, this.lineNumber, this.text.length)
  }

  get rangeIncludingLineBreak(): Range {
    return new Range(this.lineNumber, 0, this.lineNumber, this.text.length + this.eolLength)
  }

  get firstNonWhitespaceCharacterIndex(): number {
    const match = /\S/.exec(this.text)
    return match ? match.index : this.text.length
  }

  get isEmptyOrWhitespace(): boolean {
    return this.firstNonWhitespaceCharacterIndex === this.text.length
  }
}

// ── Documento ─────────────────────────────────────────────────────────────

/** Lo que el documento necesita del host (escribir en disco delegado). */
export interface DocumentHost {
  writeFile(path: string, content: string): Promise<{ success: boolean; error?: string }>
}

export class TextDocumentImpl {
  /**
   * URI REAL del documento. Para un archivo es `file:`; para un documento
   * VIRTUAL (contenido que sirve una extensión) es la URI original, con su
   * esquema y query: las extensiones comparan `document.uri.toString()` contra
   * la URI que pidieron, y una `file:` inventada rompía esa comparación.
   */
  readonly uri: Uri
  readonly fileName: string
  readonly isUntitled = false
  languageId: string
  version: number
  isDirty: boolean
  isClosed = false
  eol: '\n' | '\r\n'

  private text: string
  /** Cache de líneas (se invalida al cambiar el texto). */
  private lines: string[] | null = null

  constructor(
    snapshot: DocumentSnapshot,
    private readonly host: DocumentHost,
    uri?: Uri
  ) {
    this.uri = uri ?? Uri.file(snapshot.path)
    this.fileName = snapshot.path
    this.languageId = snapshot.languageId
    this.version = snapshot.version
    this.isDirty = snapshot.dirty
    this.eol = snapshot.eol
    this.text = snapshot.text
  }

  get lineCount(): number {
    return this.splitLines().length
  }

  getText(range?: Range): string {
    if (!range) return this.text
    if (range.isEmpty) return ''
    const lines = this.splitLines()
    const first = Math.max(0, Math.min(range.start.line, lines.length - 1))
    const last = Math.max(0, Math.min(range.end.line, lines.length - 1))
    if (first === last) {
      return lines[first].slice(range.start.character, range.end.character)
    }
    const parts = [lines[first].slice(range.start.character)]
    for (let i = first + 1; i < last; i++) parts.push(lines[i])
    parts.push(lines[last].slice(0, range.end.character))
    return parts.join('\n')
  }

  lineAt(lineOrPosition: number | Position): TextLine {
    const lines = this.splitLines()
    const number =
      typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line
    const line = Math.max(0, Math.min(number, lines.length - 1))
    return new TextLine(line, lines[line], this.eol.length)
  }

  offsetAt(position: Position): number {
    const lines = this.splitLines()
    const line = Math.max(0, Math.min(position.line, lines.length - 1))
    let offset = 0
    for (let i = 0; i < line; i++) offset += lines[i].length + 1
    return offset + Math.max(0, Math.min(position.character, lines[line].length))
  }

  positionAt(offset: number): Position {
    const lines = this.splitLines()
    let remaining = Math.max(0, offset)
    for (let line = 0; line < lines.length; line++) {
      const length = lines[line].length + 1
      if (remaining < length) return new Position(line, Math.min(remaining, lines[line].length))
      remaining -= length
    }
    const last = lines.length - 1
    return new Position(last, lines[last].length)
  }

  /** Palabra en la posición (VS Code: `\w` + guiones, configurable por idioma). */
  getWordRangeAtPosition(position: Position, regex = /[A-Za-z0-9_-]+/): Range | undefined {
    const line = this.lineAt(position.line).text
    const global = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`)
    let match: RegExpExecArray | null
    while ((match = global.exec(line)) !== null) {
      if (match.index <= position.character && match.index + match[0].length >= position.character) {
        return new Range(position.line, match.index, position.line, match.index + match[0].length)
      }
      if (match.index > position.character) break
      if (match[0].length === 0) global.lastIndex++
    }
    return undefined
  }

  validateRange(range: Range): Range {
    const lines = this.splitLines()
    const clamp = (position: Position): Position => {
      const line = Math.max(0, Math.min(position.line, lines.length - 1))
      return new Position(line, Math.max(0, Math.min(position.character, lines[line].length)))
    }
    return new Range(clamp(range.start), clamp(range.end))
  }

  validatePosition(position: Position): Position {
    return this.validateRange(new Range(position, position)).start
  }

  /** Escribe el buffer actual a disco (jail del main) y marca clean. */
  async save(): Promise<boolean> {
    const result = await this.host.writeFile(this.fileName, this.text)
    if (!result.success) return false
    this.isDirty = false
    return true
  }

  /** Aplica un snapshot nuevo (llegó `doc/change`). */
  applySnapshot(snapshot: DocumentSnapshot): void {
    this.text = snapshot.text
    this.lines = null
    this.version = snapshot.version
    this.isDirty = snapshot.dirty
    this.eol = snapshot.eol
    if (snapshot.languageId) this.languageId = snapshot.languageId
  }

  /** Snapshot de eventos de cambio (VS Code entrega el texto nuevo completo). */
  snapshotContent(): string {
    return this.text
  }

  markSaved(version: number): void {
    this.version = version
    this.isDirty = false
  }

  private splitLines(): string[] {
    if (this.lines === null) this.lines = this.text.split(/\r\n|\n|\r/)
    return this.lines
  }
}

// ── Editor (lo que ven `activeTextEditor` / `visibleTextEditors`) ─────────

export class TextEditorImpl {
  readonly document: TextDocumentImpl
  readonly selections: Selection[]
  viewColumn = 1

  constructor(
    document: TextDocumentImpl,
    selection?: DocumentSelection,
    /**
     * Puente hacia `editor.setDecorations`: el editor NO sabe qué es una
     * decoración (el registro vive en `editorDecorations.ts`), sólo dice "este
     * archivo, este tipo, estos rangos". Sin esto, el método faltaría y una
     * extensión que pinta rangos moriría con "not a function".
     */
    private readonly onSetDecorations?: (path: string, type: unknown, ranges: unknown) => void
  ) {
    const range = selection
      ? new Selection(
          selection.start.line,
          selection.start.character,
          selection.end.line,
          selection.end.character
        )
      : new Selection(new Position(0, 0), new Position(0, 0))
    this.document = document
    this.selections = [range]
  }

  /**
   * `TextEditor.setDecorations(tipo, rangos | opciones[])`: REAL.
   *
   * Los rangos viajan al registro del host y de ahí a la UI, que los dibuja
   * con el canal de subrayados del motor. Llamar con una lista vacía borra las
   * del tipo (como VS Code) — es la forma en que una extensión limpia lo que
   * había pintado.
   */
  setDecorations(type: unknown, ranges: unknown): void {
    this.onSetDecorations?.(this.document.fileName, type, ranges)
  }

  get selection(): Selection {
    return this.selections[0]
  }

  get visibleRanges(): Range[] {
    return [new Range(new Position(0, 0), this.document.positionAt(this.document.getText().length))]
  }

  get options(): Record<string, unknown> {
    return { tabSize: 2, insertSpaces: true }
  }
}

// ── Store ─────────────────────────────────────────────────────────────────

export interface DocumentStoreCallbacks {
  onOpen(document: TextDocumentImpl): void
  onChange(document: TextDocumentImpl): void
  onClose(document: TextDocumentImpl): void
  onSave(document: TextDocumentImpl): void
  onActive(path: string | null, selection?: DocumentSelection): void
  log(level: LogPayload['level'], message: string): void
  /**
   * `editor.setDecorations(...)` sobre un archivo: lo aplica el registro de
   * decoraciones (opcional para que un store de pruebas no lo necesite).
   */
  onSetDecorations?(path: string, type: unknown, ranges: unknown): void
}

/**
 * Estado de los documentos abiertos + el activo.
 *
 * El ORDEN y la identidad importan: `workspace.textDocuments` devuelve el mismo
 * objeto mientras el documento siga abierto, porque las extensiones guardan
 * referencias (y `WeakMap`/`Set` con ellos). Por eso `apply()` muta el
 * documento existente en vez de recrearlo.
 */
export class DocumentStore {
  private readonly documents = new Map<string, TextDocumentImpl>()
  /** Orden de apertura (el array que ve la extensión). */
  private readonly order: string[] = []
  private activePath: string | null = null
  private activeSelection: DocumentSelection | undefined

  constructor(
    private readonly host: DocumentHost,
    private readonly callbacks: DocumentStoreCallbacks
  ) {}

  get all(): TextDocumentImpl[] {
    return this.order.map((path) => this.documents.get(path)).filter((d): d is TextDocumentImpl => Boolean(d))
  }

  get(path: string): TextDocumentImpl | undefined {
    return this.documents.get(path)
  }

  get activeDocument(): TextDocumentImpl | undefined {
    return this.activePath ? this.documents.get(this.activePath) : undefined
  }

  get activeEditor(): TextEditorImpl | undefined {
    const document = this.activeDocument
    if (!document) return undefined
    return new TextEditorImpl(document, this.activeSelection, this.decoratorCallback)
  }

  get editors(): TextEditorImpl[] {
    return this.all.map((document) => new TextEditorImpl(document, undefined, this.decoratorCallback))
  }

  /** Callback de decoraciones ya atado (o `undefined` si el store no tiene). */
  private get decoratorCallback():
    | ((path: string, type: unknown, ranges: unknown) => void)
    | undefined {
    const handler = this.callbacks.onSetDecorations
    return handler ? (path, type, ranges) => handler.call(this.callbacks, path, type, ranges) : undefined
  }

  /** Snapshot completo (el host lo manda al arrancar, ver `init`). */
  seed(events: DocumentEvent[]): void {
    for (const event of events) this.apply(event, true)
  }

  /**
   * Aplica un hecho del editor. `silent` = estado inicial (no hay extensiones
   * suscriptas todavía, así que no se disparan eventos… pero SÍ se registra el
   * documento, para que `textDocuments` ya venga con contenido).
   */
  apply(event: DocumentEvent, silent = false): void {
    if (event.kind === 'open') {
      const existing = this.documents.get(event.document.path)
      if (existing) {
        // Reapertura de un doc que seguía vivo (la tab se cerró y se volvió a
        // abrir): se actualiza y se re-emite open, como VS Code.
        existing.applySnapshot(event.document)
        if (!silent) this.callbacks.onOpen(existing)
        return
      }
      const document = new TextDocumentImpl(event.document, this.host)
      this.documents.set(document.fileName, document)
      this.order.push(document.fileName)
      if (!silent) this.callbacks.onOpen(document)
      return
    }

    if (event.kind === 'change') {
      const document = this.documents.get(event.document.path)
      if (!document) {
        // Cambio de un doc que no conocíamos (p.ej. el IDE reabrió el archivo
        // antes de que llegara el open): se trata como apertura, no se pierde.
        this.apply({ kind: 'open', document: event.document }, silent)
        return
      }
      document.applySnapshot(event.document)
      if (!silent) this.callbacks.onChange(document)
      return
    }

    if (event.kind === 'save') {
      const document = this.documents.get(event.path)
      if (!document) return
      document.markSaved(event.version)
      if (!silent) this.callbacks.onSave(document)
      return
    }

    if (event.kind === 'close') {
      const document = this.documents.get(event.path)
      if (!document) return
      document.isClosed = true
      this.documents.delete(event.path)
      const at = this.order.indexOf(event.path)
      if (at !== -1) this.order.splice(at, 1)
      if (this.activePath === event.path) this.activePath = null
      if (!silent) this.callbacks.onClose(document)
      return
    }

    // active
    if (event.path !== null && !this.documents.has(event.path)) {
      // El IDE activó un archivo cuyo snapshot todavía no llegó (o no es de
      // texto): se avisa pero no se inventa un documento vacío.
      this.callbacks.log('info', `documento activo sin snapshot todavía: ${event.path}`)
    }
    this.activePath = event.path
    this.activeSelection = event.selection
    if (!silent) this.callbacks.onActive(event.path, event.selection)
  }

  /**
   * Abre un documento que la extensión pidió leer (`openTextDocument`) y que
   * NO está abierto en el editor: se lee del disco (jail del main) y queda en
   * `textDocuments` mientras la extensión lo tenga referenciado.
   */
  openExternal(
    path: string,
    text: string,
    languageId: string,
    version: number,
    uri?: Uri
  ): TextDocumentImpl {
    const existing = this.documents.get(path)
    if (existing) return existing
    const document = new TextDocumentImpl(
      { path, text, languageId, version, dirty: false, eol: text.includes('\r\n') ? '\r\n' : '\n' },
      this.host,
      uri
    )
    this.documents.set(path, document)
    this.order.push(path)
    this.callbacks.onOpen(document)
    return document
  }

  /**
   * Contenido NUEVO de un documento que la extensión maneja (no está en disco):
   * los documentos virtuales (`registerTextDocumentContentProvider`). Se aplica
   * como un cambio real, así los listeners de `onDidChangeTextDocument` corren.
   *
   * `key` es la clave del documento (para un virtual, su URI completa).
   */
  refreshExternal(key: string, text: string): void {
    const document = this.documents.get(key)
    if (!document) return
    document.applySnapshot({
      path: key,
      text,
      languageId: document.languageId,
      version: document.version + 1,
      dirty: false,
      eol: document.eol
    })
    this.callbacks.onChange(document)
  }

  disposeAll(): void {
    for (const document of this.all) document.isClosed = true
    this.documents.clear()
    this.order.length = 0
    this.activePath = null
  }
}

/** `TextDocumentChangeEvent` shape (lo que reciben los listeners). */
export function changeEvent(document: TextDocumentImpl): {
  document: TextDocumentImpl
  reason: undefined
  contentChanges: { range: Range; text: string; rangeLength: number }[]
} {
  return {
    document,
    reason: undefined,
    contentChanges: [
      {
        range: new Range(new Position(0, 0), document.positionAt(document.getText().length)),
        text: document.getText(),
        rangeLength: document.getText().length
      }
    ]
  }
}

