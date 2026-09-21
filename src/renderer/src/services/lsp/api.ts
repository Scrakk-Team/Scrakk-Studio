/**
 * LSP — API pública del renderer.
 *
 * Cliente fino sobre el runtime del proceso main (window.api.lsp). Aquí vive
 * la superficie que el editor, las tools del agente o cualquier panel
 * consumen: workspace sync, requests tipados y diagnósticos en vivo.
 *
 * Réplica de la superficie del CLI (LspBackend trait): ensure/notify/drain/
 * read/status + operaciones LSP comunes ya tipadas.
 */

import type {
  FileDiagnostics,
  LspDiagnostic,
  LspRequestResponse,
  LspServerActionResult,
  LspServerStatus
} from '@shared/lsp'
import { getProblems } from './diagnosticsStore'

// ── Workspace ──────────────────────────────────────────────────────────────

/** Setea el root del proyecto (debe llamarse al abrir/cambiar carpeta). */
export async function setLspWorkspace(rootPath: string): Promise<string[]> {
  if (!window.api?.lsp) return []
  const res = await window.api.lsp.setWorkspace(rootPath)
  return res.ok ? res.servers : []
}

// ── Estado ─────────────────────────────────────────────────────────────────

export async function lspStatus(): Promise<LspServerStatus[]> {
  if (!window.api?.lsp) return []
  return window.api.lsp.status()
}

// ── Sync de archivos (editor / tools) ──────────────────────────────────────

/** didOpen/didChange/didSave en los servers que atienden el archivo. */
export async function lspNotifyFileChanged(path: string, content: string): Promise<void> {
  await window.api?.lsp?.notifyFileChanged(path, content)
}

/** didClose en todos los servers que lo tengan abierto. */
export async function lspNotifyFileClosed(path: string): Promise<void> {
  await window.api?.lsp?.notifyFileClosed(path)
}

/**
 * Espera (acotado) a que TODOS los servers con diagnósticos pendientes
 * reporten y devuelve el agregado ERROR/WARNING por archivo.
 * Es el equivalente directo de drain_lsp_diagnostics del CLI.
 */
export async function lspDrainDiagnostics(timeoutMs?: number): Promise<FileDiagnostics[]> {
  if (!window.api?.lsp) return []
  return window.api.lsp.drainDiagnostics(timeoutMs)
}

/** Diagnósticos actuales para rutas específicas (abre el archivo si hace falta). */
export async function lspReadDiagnostics(paths: string[]): Promise<FileDiagnostics[]> {
  if (!window.api?.lsp) return []
  return window.api.lsp.readDiagnostics(paths)
}

// ── Requests genéricos ─────────────────────────────────────────────────────

/** Request LSP crudo enrutado a los servers del archivo (o broadcast). */
export async function lspRequest(
  method: string,
  params?: unknown,
  options?: { filePath?: string; broadcast?: boolean; timeoutMs?: number; serverName?: string }
): Promise<LspRequestResponse> {
  if (!window.api?.lsp) return { ok: false, results: [], error: 'sin puente LSP' }
  return window.api.lsp.request({
    method,
    params,
    filePath: options?.filePath,
    broadcast: options?.broadcast,
    timeoutMs: options?.timeoutMs,
    serverName: options?.serverName
  })
}

// ── Operaciones tipadas (posiciones 0-based, como el CLI) ──────────────────

interface TextDocumentPositionParams {
  textDocument: { uri: string }
  position: { line: number; character: number }
}

function positionParams(filePath: string, line: number, character: number): TextDocumentPositionParams {
  return {
    textDocument: { uri: pathToFileUri(filePath) },
    position: { line, character }
  }
}

export function pathToFileUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return `file://${normalized.startsWith('/') ? '' : '/'}${normalized}`
}

/** textDocument/definition → locations (scalar/array/link unificados). */
export async function lspGoToDefinition(
  filePath: string,
  line: number,
  character: number
): Promise<Array<{ uri: string; range: LspDiagnostic['range'] }>> {
  const res = await lspRequest('textDocument/definition', positionParams(filePath, line, character), { filePath })
  return flattenLocations(res)
}

/** textDocument/references (incluye declaración). */
export async function lspFindReferences(
  filePath: string,
  line: number,
  character: number
): Promise<Array<{ uri: string; range: LspDiagnostic['range'] }>> {
  const res = await lspRequest(
    'textDocument/references',
    { ...positionParams(filePath, line, character), context: { includeDeclaration: true } },
    { filePath }
  )
  return flattenLocations(res)
}

/** textDocument/hover → contenido plano por server. */
export async function lspHover(
  filePath: string,
  line: number,
  character: number
): Promise<Array<{ serverName: string; contents: unknown }>> {
  const res = await lspRequest('textDocument/hover', positionParams(filePath, line, character), { filePath })
  return res.results
    .filter((r) => r.error === undefined && r.result !== null && r.result !== undefined)
    .map((r) => ({ serverName: r.serverName, contents: (r.result as { contents?: unknown }).contents }))
}

/** textDocument/documentSymbol (flat + nested aplanados). */
export interface LspSymbolInformation {
  name: string
  kind: number
  location: { uri: string; range: LspDiagnostic['range'] }
  containerName?: string
}

export async function lspDocumentSymbol(filePath: string): Promise<LspSymbolInformation[]> {
  const res = await lspRequest('textDocument/documentSymbol', { textDocument: { uri: pathToFileUri(filePath) } }, { filePath })
  const symbols: LspSymbolInformation[] = []
  for (const entry of res.results) {
    const result = entry.result as
      | Array<{ name: string; kind: number; location?: LspSymbolInformation['location']; range?: LspDiagnostic['range']; detail?: string; children?: unknown[] }>
      | { name: string; kind: number; range: LspDiagnostic['range']; selectionRange: LspDiagnostic['range']; children?: unknown[] }
      | null
    if (!Array.isArray(result)) continue
    for (const symbol of result) {
      if ('location' in symbol && symbol.location) {
        symbols.push({ name: symbol.name, kind: symbol.kind, location: symbol.location })
      } else if ('range' in symbol) {
        symbols.push({
          name: symbol.name,
          kind: symbol.kind,
          location: { uri: pathToFileUri(filePath), range: symbol.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }
        })
      }
    }
  }
  return symbols
}

/**
 * Nombres de TODOS los símbolos del documento (recursivo, con hijos), para el
 * subrayado de definición: saber si un nombre está declarado en el archivo sin
 * pedir `textDocument/definition` en cada hover.
 */
export async function lspDocumentSymbolNames(filePath: string): Promise<Set<string>> {
  const res = await lspRequest(
    'textDocument/documentSymbol',
    { textDocument: { uri: pathToFileUri(filePath) } },
    { filePath }
  )
  const names = new Set<string>()
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const record = node as { name?: unknown; children?: unknown }
    if (typeof record.name === 'string' && record.name.length > 0) names.add(record.name)
    if (Array.isArray(record.children)) {
      for (const child of record.children) visit(child)
    }
  }
  for (const entry of res.results) {
    if (Array.isArray(entry.result)) {
      for (const symbol of entry.result) visit(symbol)
    }
  }
  return names
}

/** workspace/symbol (broadcast a todos los servers corriendo). */export async function lspWorkspaceSymbol(query: string): Promise<LspSymbolInformation[]> {
  const res = await lspRequest('workspace/symbol', { query }, { broadcast: true })
  const symbols: LspSymbolInformation[] = []
  for (const entry of res.results) {
    const result = entry.result as LspSymbolInformation[] | null
    if (Array.isArray(result)) symbols.push(...result)
  }
  return symbols
}

/** textDocument/prepareRename + rename → WorkspaceEdit crudo por server. */
export async function lspRename(
  filePath: string,
  line: number,
  character: number,
  newName: string
): Promise<LspRequestResponse> {
  return lspRequest(
    'textDocument/rename',
    { ...positionParams(filePath, line, character), newName },
    { filePath }
  )
}

// ── Operaciones extendidas (paridad con las 19 del CLI) ────────────────────

/** textDocument/implementation. */
export async function lspGoToImplementation(
  filePath: string,
  line: number,
  character: number
): Promise<Array<{ uri: string; range: LspDiagnostic['range'] }>> {
  const res = await lspRequest('textDocument/implementation', positionParams(filePath, line, character), { filePath })
  return flattenLocations(res)
}

/** textDocument/typeDefinition. */
export async function lspGoToTypeDefinition(
  filePath: string,
  line: number,
  character: number
): Promise<Array<{ uri: string; range: LspDiagnostic['range'] }>> {
  const res = await lspRequest('textDocument/typeDefinition', positionParams(filePath, line, character), { filePath })
  return flattenLocations(res)
}

/** textDocument/declaration. */
export async function lspGoToDeclaration(
  filePath: string,
  line: number,
  character: number
): Promise<Array<{ uri: string; range: LspDiagnostic['range'] }>> {
  const res = await lspRequest('textDocument/declaration', positionParams(filePath, line, character), { filePath })
  return flattenLocations(res)
}

/** textDocument/documentHighlight. */
export interface LspDocumentHighlight {
  range: LspDiagnostic['range']
  kind?: number
}

export async function lspDocumentHighlight(
  filePath: string,
  line: number,
  character: number
): Promise<LspDocumentHighlight[]> {
  const res = await lspRequest('textDocument/documentHighlight', positionParams(filePath, line, character), { filePath })
  const out: LspDocumentHighlight[] = []
  for (const entry of res.results) {
    if (entry.error !== undefined || !Array.isArray(entry.result)) continue
    out.push(...(entry.result as LspDocumentHighlight[]))
  }
  return out
}

/** textDocument/completion → ítems TAGGEADOS con el server que los dió. */
export interface TaggedCompletionItem {
  serverName: string
  item: Record<string, unknown>
}

export async function lspCompletion(
  filePath: string,
  line: number,
  character: number
): Promise<TaggedCompletionItem[]> {
  const res = await lspRequest('textDocument/completion', positionParams(filePath, line, character), { filePath })
  const items: TaggedCompletionItem[] = []
  for (const entry of res.results) {
    if (entry.error !== undefined || entry.result === null || entry.result === undefined) continue
    const raw = entry.result as unknown
    const list = Array.isArray(raw) ? raw : (raw as { items?: unknown[] })?.items ?? []
    for (const item of list as Record<string, unknown>[]) {
      items.push({ serverName: entry.serverName, item })
    }
  }
  return items
}

/**
 * completionItem/resolve — docs/detail del ítem seleccionado.
 * Va DIRIGIDO al server que devolvió el ítem (por eso el tagging).
 */
export async function lspCompletionResolve(
  filePath: string,
  tagged: TaggedCompletionItem
): Promise<Record<string, unknown>> {
  const res = await lspRequest('completionItem/resolve', tagged.item, {
    filePath,
    serverName: tagged.serverName
  })
  const primary = res.results.find((r) => r.error === undefined && r.result !== null && r.result !== undefined)
  return (primary?.result as Record<string, unknown>) ?? tagged.item
}

// ── Semantic tokens e inlay hints (capacidades declaradas en el handshake) ─

/** textDocument/semanticTokens/full → data cruda del protocolo. */
export interface SemanticTokensResult {
  resultId?: string
  data?: number[]
}

export async function lspSemanticTokensFull(filePath: string): Promise<SemanticTokensResult | null> {
  const res = await lspRequest('textDocument/semanticTokens/full', { textDocument: { uri: pathToFileUri(filePath) } }, { filePath })
  return extractSemanticTokens(res)
}

/** textDocument/semanticTokens/range. */
export async function lspSemanticTokensRange(
  filePath: string,
  startLine: number,
  endLine: number
): Promise<SemanticTokensResult | null> {
  const res = await lspRequest(
    'textDocument/semanticTokens/range',
    {
      textDocument: { uri: pathToFileUri(filePath) },
      range: { start: { line: startLine, character: 0 }, end: { line: endLine, character: 0 } }
    },
    { filePath }
  )
  return extractSemanticTokens(res)
}

function extractSemanticTokens(res: LspRequestResponse): SemanticTokensResult | null {
  for (const entry of res.results) {
    if (entry.error !== undefined || entry.result === null || entry.result === undefined) continue
    const result = entry.result as { data?: number[]; resultId?: string }
    if (Array.isArray(result.data)) return { data: result.data, resultId: result.resultId }
  }
  return null
}

/** textDocument/inlayHint para un rango de líneas. */
export async function lspInlayHints(
  filePath: string,
  startLine: number,
  endLine: number
): Promise<unknown[]> {
  const res = await lspRequest(
    'textDocument/inlayHint',
    {
      textDocument: { uri: pathToFileUri(filePath) },
      range: { start: { line: startLine, character: 0 }, end: { line: endLine, character: 0 } }
    },
    { filePath }
  )
  const hints: unknown[] = []
  for (const entry of res.results) {
    if (entry.error !== undefined || !Array.isArray(entry.result)) continue
    hints.push(...entry.result)
  }
  return hints
}

/** inlayHint/resolve — tooltip/textEdits del hint seleccionado. */
export async function lspInlayHintResolve(hint: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await lspRequest('inlayHint/resolve', hint)
  const primary = res.results.find((r) => r.error === undefined && r.result !== null && r.result !== undefined)
  return (primary?.result as Record<string, unknown>) ?? hint
}

// ── Multi-root real ────────────────────────────────────────────────────────

export async function lspAddWorkspaceRoot(rootPath: string): Promise<string[]> {
  if (!window.api?.lsp) return []
  const res = await window.api.lsp.addWorkspaceRoot(rootPath)
  return res.ok ? res.servers : []
}

export async function lspRemoveWorkspaceRoot(rootPath: string): Promise<string[]> {
  if (!window.api?.lsp) return []
  const res = await window.api.lsp.removeWorkspaceRoot(rootPath)
  return res.roots
}

export async function lspListWorkspaceRoots(): Promise<string[]> {
  if (!window.api?.lsp) return []
  const res = await window.api.lsp.listWorkspaceRoots()
  return res.roots
}

// ── Progreso $/progress ────────────────────────────────────────────────────

export interface LspProgressEvent {
  serverName: string
  token: string
  phase: 'begin' | 'report' | 'end'
  title?: string
  message?: string
  percentage?: number
}

export function onLspProgress(callback: (payload: LspProgressEvent) => void): () => void {
  if (!window.api?.lsp) return () => {}
  return window.api.lsp.onProgress(callback)
}

// ── Suscripciones en vivo ──────────────────────────────────────────────────

/** textDocument/signatureHelp por server. */
export async function lspSignatureHelp(
  filePath: string,
  line: number,
  character: number
): Promise<Array<{ serverName: string; result: unknown }>> {
  const res = await lspRequest('textDocument/signatureHelp', positionParams(filePath, line, character), { filePath })
  return res.results
    .filter((r) => r.error === undefined && r.result !== null && r.result !== undefined)
    .map((r) => ({ serverName: r.serverName, result: r.result }))
}

export interface LspCodeAction {
  title: string
  kind?: string
  edit?: unknown
  command?: unknown
}

/** textDocument/codeAction (context con diagnostics activos). */
export async function lspCodeAction(
  filePath: string,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number
): Promise<Array<{ serverName: string; actions: LspCodeAction[] }>> {
  const diagnostics = getProblems(filePath).slice(0, 20)
  const res = await lspRequest(
    'textDocument/codeAction',
    {
      textDocument: { uri: pathToFileUri(filePath) },
      range: {
        start: { line: startLine, character: startCharacter },
        end: { line: endLine, character: endCharacter }
      },
      context: { diagnostics: diagnostics as unknown[] }
    },
    { filePath }
  )
  const out: Array<{ serverName: string; actions: LspCodeAction[] }> = []
  for (const entry of res.results) {
    if (entry.error !== undefined || !Array.isArray(entry.result)) continue
    out.push({ serverName: entry.serverName, actions: entry.result as LspCodeAction[] })
  }
  return out
}

/** textDocument/formatting → TextEdits por server. */
export async function lspFormatting(filePath: string): Promise<Array<{ serverName: string; edits: unknown[] }>> {
  const res = await lspRequest(
    'textDocument/formatting',
    { textDocument: { uri: pathToFileUri(filePath) }, options: { tabSize: 2, insertSpaces: true } },
    { filePath }
  )
  return res.results.filter((r) => r.error === undefined && Array.isArray(r.result)) as Array<{ serverName: string; edits: unknown[] }>
}

/** textDocument/rangeFormatting. */
export async function lspRangeFormatting(
  filePath: string,
  startLine: number,
  endLine: number
): Promise<Array<{ serverName: string; edits: unknown[] }>> {
  const res = await lspRequest(
    'textDocument/rangeFormatting',
    {
      textDocument: { uri: pathToFileUri(filePath) },
      range: {
        start: { line: startLine, character: 0 },
        end: { line: endLine, character: 0 }
      },
      options: { tabSize: 2, insertSpaces: true }
    },
    { filePath }
  )
  return res.results.filter((r) => r.error === undefined && Array.isArray(r.result)) as Array<{ serverName: string; edits: unknown[] }>
}

/** Call hierarchy: prepare + incoming/outgoing. */
export async function lspPrepareCallHierarchy(
  filePath: string,
  line: number,
  character: number
): Promise<unknown[]> {
  const res = await lspRequest('textDocument/prepareCallHierarchy', positionParams(filePath, line, character), { filePath })
  const items: unknown[] = []
  for (const entry of res.results) {
    if (entry.error !== undefined || !Array.isArray(entry.result)) continue
    items.push(...entry.result)
  }
  return items
}

export async function lspCallHierarchyIncoming(
  filePath: string,
  items: unknown[]
): Promise<unknown[]> {
  const res = await lspRequest('callHierarchy/incomingCalls', { item: items[0] }, { filePath })
  return collectCallHierarchyResults(res)
}

export async function lspCallHierarchyOutgoing(
  filePath: string,
  items: unknown[]
): Promise<unknown[]> {
  const res = await lspRequest('callHierarchy/outgoingCalls', { item: items[0] }, { filePath })
  return collectCallHierarchyResults(res)
}

function collectCallHierarchyResults(res: LspRequestResponse): unknown[] {
  const out: unknown[] = []
  for (const entry of res.results) {
    if (entry.error !== undefined || !Array.isArray(entry.result)) continue
    out.push(...entry.result)
  }
  return out
}

// ── WorkspaceEdit → ediciones accionables (formato CLI dispatch.rs) ───────

export interface FlatTextEdit {
  /** Ruta absoluta del archivo a editar. */
  file: string
  startLine: number
  startCharacter: number
  endLine: number
  endCharacter: number
  newText: string
}

/**
 * Aplana un WorkspaceEdit (changes / documentChanges) a ediciones planas
 * `file:l:c-l:c => new_text` — el formato que el CLI le devuelve al agente.
 */
export async function flattenWorkspaceEdit(edit: unknown): Promise<FlatTextEdit[]> {
  if (!edit || typeof edit !== 'object') return []
  const e = edit as {
    changes?: Record<string, Array<{ range: LspDiagnostic['range']; newText: string }>>
    documentChanges?: Array<{
      textDocument?: { uri: string }
      edits?: Array<{ range: LspDiagnostic['range']; newText: string }>
    }>
  }

  const flat: FlatTextEdit[] = []

  const pushEdits = (uri: string, edits: Array<{ range: LspDiagnostic['range']; newText: string }> | undefined): void => {
    if (!edits) return
    for (const edit of edits) {
      flat.push({
        file: uriToFilePath(uri),
        startLine: edit.range.start.line,
        startCharacter: edit.range.start.character,
        endLine: edit.range.end.line,
        endCharacter: edit.range.end.character,
        newText: edit.newText
      })
    }
  }

  if (e.changes) {
    for (const [uri, edits] of Object.entries(e.changes)) pushEdits(uri, edits)
  }
  if (e.documentChanges) {
    for (const change of e.documentChanges) {
      if (change.textDocument?.uri) pushEdits(change.textDocument.uri, change.edits)
    }
  }
  return flat
}

export function uriToFilePath(uri: string): string {
  try {
    return decodeURIComponent(uri.replace(/^file:\/\//, ''))
  } catch {
    return uri.replace(/^file:\/\//, '')
  }
}

// ── Suscripciones en vivo ──────────────────────────────────────────────────

export function onLspDiagnostics(
  callback: (payload: { serverName: string; path: string; diagnostics: LspDiagnostic[] }) => void
): () => void {
  if (!window.api?.lsp) return () => {}
  return window.api.lsp.onDiagnostics(callback)
}

export function onLspServerEvent(
  callback: (payload: { serverName: string; state: string; error?: string }) => void
): () => void {
  if (!window.api?.lsp) return () => {}
  return window.api.lsp.onServerEvent(callback)
}

// ── Utilidades ─────────────────────────────────────────────────────────────

type RawLocation =
  | { uri: string; range: LspDiagnostic['range'] }
  | { targetUri: string; targetSelectionRange: LspDiagnostic['range'] }

function flattenLocations(res: LspRequestResponse): Array<{ uri: string; range: LspDiagnostic['range'] }> {
  const out: Array<{ uri: string; range: LspDiagnostic['range'] }> = []
  for (const entry of res.results) {
    if (entry.error !== undefined || entry.result === null || entry.result === undefined) continue
    const raw = entry.result as RawLocation | RawLocation[] | null
    const list = Array.isArray(raw) ? raw : raw ? [raw] : []
    for (const loc of list) {
      if ('targetUri' in loc) {
        out.push({ uri: loc.targetUri, range: loc.targetSelectionRange })
      } else {
        out.push({ uri: loc.uri, range: loc.range })
      }
    }
  }
  return out
}

// ── Acciones por server (modal LSP) ────────────────────────────────────────

export async function lspRestartServer(serverName: string): Promise<LspServerActionResult> {
  if (!window.api?.lsp) return { ok: false, error: 'sin puente LSP' }
  return window.api.lsp.restartServer(serverName)
}

export async function lspInstallServer(serverName: string): Promise<LspServerActionResult> {
  if (!window.api?.lsp) return { ok: false, error: 'sin puente LSP' }
  return window.api.lsp.installServer(serverName)
}
