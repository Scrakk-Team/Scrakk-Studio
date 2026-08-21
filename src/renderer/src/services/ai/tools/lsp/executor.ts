import type { ExecutionResult, ToolContext } from '../types'
import {
  lspRequest,
  pathToFileUri,
  lspDocumentSymbol,
  lspWorkspaceSymbol,
  lspReadDiagnostics,
  flattenWorkspaceEdit,
  type LspSymbolInformation
} from '../../../lsp'
import { formatLspDiagnosticsBlock } from '../../../lsp/format'

/** Posiciones 0-based, igual que el CLI. */
interface LspToolArgs {
  operation: string
  file_path?: string
  line?: number
  character?: number
  query?: string
  new_name?: string
  end_line?: number
  end_character?: number
}

const LOCATION_METHODS: Record<string, string> = {
  goToDefinition: 'textDocument/definition',
  goToImplementation: 'textDocument/implementation',
  findReferences: 'textDocument/references',
  goToTypeDefinition: 'textDocument/typeDefinition',
  goToDeclaration: 'textDocument/declaration'
}

function requireFile(args: LspToolArgs): string | null {
  return typeof args.file_path === 'string' && args.file_path.length > 0 ? args.file_path : null
}

function ok(text: string): ExecutionResult {
  return { success: true, content: text }
}

function fail(text: string): ExecutionResult {
  return { success: false, content: text }
}

/** Locations → líneas `ruta:línea:columna` (formato dispatch.rs del CLI). */
async function locationsFor(
  method: string,
  args: LspToolArgs
): Promise<ExecutionResult> {
  const filePath = requireFile(args)
  if (!filePath || args.line === undefined || args.character === undefined) {
    return fail('Required: file_path, line, character (0-indexed).')
  }
  const params: Record<string, unknown> = {
    textDocument: { uri: pathToFileUri(filePath) },
    position: { line: args.line, character: args.character }
  }
  if (method === 'textDocument/references') {
    params.context = { includeDeclaration: true }
  }

  const res = await lspRequest(method, params, { filePath })
  if (!res.ok) return fail(res.error ?? 'request failed')

  const lines: string[] = []
  for (const entry of res.results) {
    if (entry.error !== undefined) continue
    const raw = entry.result as unknown
    const list = Array.isArray(raw) ? raw : raw ? [raw] : []
    for (const item of list as Array<Record<string, unknown>>) {
      const uri =
        (item.targetUri as string | undefined) ?? (item.uri as string | undefined)
      const range =
        (item.targetSelectionRange as { start?: { line?: number; character?: number } } | undefined) ??
        (item.range as { start?: { line?: number; character?: number } } | undefined)
      if (!uri) continue
      const path = decodeURIComponent(uri.replace(/^file:\/\//, ''))
      lines.push(`${path}:${(range?.start?.line ?? 0) + 1}:${(range?.start?.character ?? 0) + 1}`)
    }
  }

  if (lines.length === 0) return ok('No results found.')
  return ok(lines.join('\n'))
}

function symbolsToLines(symbols: LspSymbolInformation[]): string {
  if (symbols.length === 0) return 'No symbols found.'
  return symbols
    .map((symbol) => {
      const path = decodeURIComponent(symbol.location.uri.replace(/^file:\/\//, ''))
      return `${symbol.name} @ ${path}:${symbol.location.range.start.line + 1}`
    })
    .join('\n')
}

export async function execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  const op = String(args.operation ?? '')
  const fileArgs = args as unknown as LspToolArgs

  try {
    switch (op) {
      case 'goToDefinition':
      case 'goToImplementation':
      case 'findReferences':
      case 'goToTypeDefinition':
      case 'goToDeclaration':
        return await locationsFor(LOCATION_METHODS[op], fileArgs)

      case 'hover': {
        const filePath = requireFile(fileArgs)
        if (!filePath || fileArgs.line === undefined || fileArgs.character === undefined) {
          return fail('Required: file_path, line, character (0-indexed).')
        }
        const res = await lspRequest(
          'textDocument/hover',
          { textDocument: { uri: pathToFileUri(filePath) }, position: { line: fileArgs.line, character: fileArgs.character } },
          { filePath }
        )
        const texts: string[] = []
        for (const entry of res.results) {
          if (entry.error !== undefined || !entry.result) continue
          const hover = entry.result as { contents?: unknown }
          texts.push(hoverToString(hover.contents))
        }
        return ok(texts.length > 0 ? texts.join('\n---\n') : 'No hover information.')
      }

      case 'documentHighlight': {
        const filePath = requireFile(fileArgs)
        if (!filePath || fileArgs.line === undefined || fileArgs.character === undefined) {
          return fail('Required: file_path, line, character (0-indexed).')
        }
        const res = await lspRequest(
          'textDocument/documentHighlight',
          { textDocument: { uri: pathToFileUri(filePath) }, position: { line: fileArgs.line, character: fileArgs.character } },
          { filePath }
        )
        const count = res.results.reduce((acc: number, entry) => acc + (Array.isArray(entry.result) ? entry.result.length : 0), 0)
        return ok(`${count} highlight(s) en el documento.`)
      }

      case 'documentSymbol': {
        const filePath = requireFile(fileArgs)
        if (!filePath) return fail('Required: file_path.')
        return ok(symbolsToLines(await lspDocumentSymbol(filePath)))
      }

      case 'workspaceSymbol': {
        const query = typeof fileArgs.query === 'string' ? fileArgs.query : ''
        return ok(symbolsToLines(await lspWorkspaceSymbol(query)))
      }

      case 'completion': {
        const filePath = requireFile(fileArgs)
        if (!filePath || fileArgs.line === undefined || fileArgs.character === undefined) {
          return fail('Required: file_path, line, character (0-indexed).')
        }
        const res = await lspRequest(
          'textDocument/completion',
          { textDocument: { uri: pathToFileUri(filePath) }, position: { line: fileArgs.line, character: fileArgs.character } },
          { filePath }
        )
        const labels: string[] = []
        for (const entry of res.results) {
          if (entry.error !== undefined || entry.result === null || entry.result === undefined) continue
          const items = Array.isArray(entry.result)
            ? entry.result
            : ((entry.result as { items?: Array<{ label?: string }> }).items ?? [])
          for (const item of items as Array<{ label?: string }>) {
            if (item?.label) labels.push(item.label)
          }
        }
        return ok(labels.length > 0 ? [...new Set(labels)].slice(0, 50).join('\n') : 'No completions.')
      }

      case 'codeAction': {
        const filePath = requireFile(fileArgs)
        if (!filePath || fileArgs.line === undefined || fileArgs.character === undefined) {
          return fail('Required: file_path, line, character (0-indexed).')
        }
        const endLine = fileArgs.end_line ?? fileArgs.line
        const endCharacter = fileArgs.end_character ?? fileArgs.character
        const res = await lspRequest(
          'textDocument/codeAction',
          {
            textDocument: { uri: pathToFileUri(filePath) },
            range: { start: { line: fileArgs.line, character: fileArgs.character }, end: { line: endLine, character: endCharacter } },
            context: { diagnostics: [] }
          },
          { filePath }
        )
        const lines: string[] = []
        for (const entry of res.results) {
          if (entry.error !== undefined || !Array.isArray(entry.result)) continue
          for (const action of entry.result as Array<{ title?: string; edit?: unknown }>) {
            if (!action?.title) continue
            lines.push(`- ${action.title}`)
            const edits = action.edit ? await flattenWorkspaceEdit(action.edit) : []
            for (const edit of edits.slice(0, 10)) {
              lines.push(
                `  ${edit.file}:${edit.startLine + 1}:${edit.startCharacter + 1}-${edit.endLine + 1}:${edit.endCharacter + 1} => ${JSON.stringify(edit.newText).slice(0, 120)}`
              )
            }
          }
        }
        return ok(lines.length > 0 ? lines.join('\n') : 'No code actions available.')
      }

      case 'rename': {
        const filePath = requireFile(fileArgs)
        if (!filePath || fileArgs.line === undefined || fileArgs.character === undefined || !fileArgs.new_name) {
          return fail('Required: file_path, line, character, new_name.')
        }
        const res = await lspRequest(
          'textDocument/rename',
          { textDocument: { uri: pathToFileUri(filePath) }, position: { line: fileArgs.line, character: fileArgs.character }, newName: fileArgs.new_name },
          { filePath }
        )
        if (!res.ok) return fail(res.error ?? 'rename failed')
        const lines: string[] = ['Apply these edits with write_file/replace_in_file:']
        let total = 0
        for (const entry of res.results) {
          if (entry.error !== undefined || entry.result === null || entry.result === undefined) continue
          const edits = await flattenWorkspaceEdit(entry.result)
          for (const edit of edits) {
            lines.push(
              `${edit.file}:${edit.startLine + 1}:${edit.startCharacter + 1}-${edit.endLine + 1}:${edit.endCharacter + 1} => ${JSON.stringify(edit.newText)}`
            )
            total++
          }
        }
        if (total === 0) return ok('Rename produced no edits (symbol not renameable?).')
        return ok(lines.join('\n'))
      }

      case 'signatureHelp': {
        const filePath = requireFile(fileArgs)
        if (!filePath || fileArgs.line === undefined || fileArgs.character === undefined) {
          return fail('Required: file_path, line, character (0-indexed).')
        }
        const res = await lspRequest(
          'textDocument/signatureHelp',
          { textDocument: { uri: pathToFileUri(filePath) }, position: { line: fileArgs.line, character: fileArgs.character } },
          { filePath }
        )
        for (const entry of res.results) {
          if (entry.error !== undefined || !entry.result) continue
          const help = entry.result as {
            signatures?: Array<{ label?: string; parameters?: Array<{ label?: string | [number, number] }> }>
            activeSignature?: number
          }
          const signature = help.signatures?.[help.activeSignature ?? 0] ?? help.signatures?.[0]
          if (signature?.label) return ok(signature.label)
        }
        return ok('No signature help available.')
      }

      case 'documentFormatting':
      case 'documentRangeFormatting': {
        const filePath = requireFile(fileArgs)
        if (!filePath) return fail('Required: file_path.')
        const method =
          op === 'documentFormatting' ? 'textDocument/formatting' : 'textDocument/rangeFormatting'
        const params: Record<string, unknown> = {
          textDocument: { uri: pathToFileUri(filePath) },
          options: { tabSize: 2, insertSpaces: true }
        }
        if (method.endsWith('rangeFormatting')) {
          if (fileArgs.line === undefined || fileArgs.end_line === undefined) {
            return fail('Required: line y end_line para rangeFormatting.')
          }
          params.range = {
            start: { line: fileArgs.line, character: fileArgs.character ?? 0 },
            end: { line: fileArgs.end_line, character: fileArgs.end_character ?? 0 }
          }
        }
        const res = await lspRequest(method, params, { filePath })
        let count = 0
        for (const entry of res.results) {
          if (Array.isArray(entry.result)) count += entry.result.length
        }
        return ok(count > 0 ? `${count} text edits de formato disponibles (aplicar con replace_in_file).` : 'No formatting edits.')
      }

      case 'prepareCallHierarchy':
      case 'callHierarchyIncoming':
      case 'callHierarchyOutgoing': {
        const filePath = requireFile(fileArgs)
        if (!filePath || fileArgs.line === undefined || fileArgs.character === undefined) {
          return fail('Required: file_path, line, character (0-indexed).')
        }
        if (op === 'prepareCallHierarchy') {
          const res = await lspRequest(
            'textDocument/prepareCallHierarchy',
            { textDocument: { uri: pathToFileUri(filePath) }, position: { line: fileArgs.line, character: fileArgs.character } },
            { filePath }
          )
          const items = res.results.find((r) => Array.isArray(r.result))?.result as
            | Array<{ name?: string; uri?: string }>
            | undefined
          if (!items || items.length === 0) return ok('No call hierarchy item at this position.')
          return ok(items.map((i) => `${i.name} @ ${i.uri}`).join('\n'))
        }
        // incoming/outgoing requieren un item preparado: preparar y encadenar.
        const prepare = await lspRequest(
          'textDocument/prepareCallHierarchy',
          { textDocument: { uri: pathToFileUri(filePath) }, position: { line: fileArgs.line, character: fileArgs.character } },
          { filePath }
        )
        const found = prepare.results.find((r) => Array.isArray(r.result) && r.result.length > 0)
        const item = found ? (found.result as unknown[])[0] : undefined
        if (!item) return ok('No call hierarchy item at this position.')
        const callMethod = op === 'callHierarchyIncoming' ? 'callHierarchy/incomingCalls' : 'callHierarchy/outgoingCalls'
        const res = await lspRequest(callMethod, { item }, { filePath })
        const lines: string[] = []
        for (const entry of res.results) {
          if (entry.error !== undefined || !Array.isArray(entry.result)) continue
          for (const call of entry.result as Array<{ from?: { name?: string; uri?: string }; to?: { name?: string; uri?: string }; fromRanges?: unknown[] }>) {
            const side = op === 'callHierarchyIncoming' ? call.from : call.to
            if (side?.name) {
              lines.push(`${side.name} @ ${side.uri ?? '?'}`)
            }
          }
        }
        return ok(lines.length > 0 ? lines.join('\n') : `No ${op === 'callHierarchyIncoming' ? 'callers' : 'callees'} found.`)
      }

      case 'diagnostics': {
        const filePath = requireFile(fileArgs)
        if (!filePath) return fail('Required: file_path.')
        const entries = await lspReadDiagnostics([filePath])
        const block = formatLspDiagnosticsBlock(entries)
        return ok(block ?? 'No errors or warnings.')
      }

      default:
        return fail(`Operación desconocida: "${op}".`)
    }
  } catch (error) {
    return fail(`LSP error: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function hoverToString(contents: unknown): string {
  if (typeof contents === 'string') return contents
  if (Array.isArray(contents)) return contents.map(hoverToString).join('\n')
  if (contents && typeof contents === 'object') {
    const c = contents as { value?: string; kind?: string }
    if (typeof c.value === 'string') return c.value
  }
  return ''
}
