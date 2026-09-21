/**
 * Navegación a la definición — resolución compartida.
 *
 * Un solo camino para "¿a dónde apunta este símbolo?" y "llevame ahí", usado
 * por el hover/click del editor y por el menú contextual:
 *
 *   1. ÁRBOL (`locals.scm`): resuelve ámbitos finos.
 *   2. SÍMBOLOS (`tags.scm`): resuelve clases/funciones/métodos declarados.
 *   3. LSP: resuelve cross-file (lenguajes con server).
 *
 * El orden importa: el árbol es en memoria y respeta ámbitos; el símbolo cubre
 * lenguajes sin `locals.scm`; el LSP cubre lo que no está en el archivo.
 */

import { getDynamicSyntax } from '@services/extensions/dynamicSyntax'
import { lspDocumentSymbolNames, lspGoToDefinition } from '@services/lsp'
import { getEditorFiles, openFileInEditor, activateFile } from './editorBus'
import { getFileSessionText } from './fileSession'
import { revealInnertaPosition } from './engines/innerta/hostBridge'
import { resolveDefinition, resolveSymbolDefinition, wordAt } from './treeNavigationLogic'

export interface DefinitionTarget {
  path: string
  line: number
  column: number
}

/** Texto del archivo (buffer vivo o disco). Exportado para el subrayado. */
export async function activeFileText(path: string): Promise<string | null> {
  const live = getFileSessionText(path)
  if (typeof live === 'string') return live
  try {
    const res = await window.api.fs.readFile(path)
    return res.success ? (res.content ?? null) : null
  } catch {
    return null
  }
}

/**
 * Resuelve con el ÁRBOL, dentro del archivo activo (`locals.scm` y `tags.scm`).
 * `null` = el lenguaje no tiene datos o no hay definición para ese nombre.
 */
export async function resolveTreeTarget(position: {
  line: number
  col: number
}): Promise<DefinitionTarget | null> {
  const { activePath } = getEditorFiles()
  if (!activePath) return null
  const syntax = getDynamicSyntax(activePath)
  if (!syntax) return null
  const text = await activeFileText(activePath)
  if (text === null) return null
  const name = wordAt(text, position.line, position.col)
  if (name.length === 0) return null

  if (syntax.locals.length > 0) {
    const local = resolveDefinition(syntax.locals, name, {
      line: position.line,
      column: position.col
    })
    if (local) return { path: activePath, line: local.line, column: local.column }
  }

  const symbol = resolveSymbolDefinition(syntax.symbols, name, {
    line: position.line,
    column: position.col
  })
  if (symbol) return { path: activePath, line: symbol.line, column: 0 }
  return null
}

/**
 * Resolución de ÁRBOL **síncrona** desde el buffer vivo (sin await ni disco).
 * Es la que usa el hover para subrayar al instante; `null` = el árbol no sabe.
 */
export function resolveTreeTargetFromBuffer(
  path: string,
  line: number,
  col: number
): DefinitionTarget | null {
  const text = getFileSessionText(path)
  if (typeof text !== 'string') return null
  const syntax = getDynamicSyntax(path)
  if (!syntax) return null
  const name = wordAt(text, line, col)
  if (name.length === 0) return null

  if (syntax.locals.length > 0) {
    const local = resolveDefinition(syntax.locals, name, { line, column: col })
    if (local) return { path, line: local.line, column: local.column }
  }
  const symbol = resolveSymbolDefinition(syntax.symbols, name, { line, column: col })
  if (symbol) return { path, line: symbol.line, column: 0 }
  return null
}

// ── Caché de símbolos del LSP (para subrayar al instante) ──────────────────
//
// Para lenguajes del MOTOR (Python, TS, …) no hay `locals.scm`/`tags.scm`, así
// que resolver la existencia con `textDocument/definition` en cada hover es
// lento. Acá se prefetchean los nombres declarados del archivo UNA vez y el
// subrayado decide al instante; el `definition` queda solo para el click.
const lspSymbolNames = new Map<string, Set<string>>()
const lspSymbolRequests = new Map<string, Promise<void>>()

/** Prefetchea los nombres de símbolos del archivo (una vez por archivo). */
export function primeLspSymbolNames(path: string): void {
  if (lspSymbolNames.has(path) || lspSymbolRequests.has(path)) return
  const request = lspDocumentSymbolNames(path)
    .then((names) => {
      if (names.size > 0) lspSymbolNames.set(path, names)
    })
    .catch(() => {
      /* sin server: no se cachea (se reintenta la próxima) */
    })
    .finally(() => {
      lspSymbolRequests.delete(path)
    })
  lspSymbolRequests.set(path, request)
}

/** ¿El archivo declara un símbolo con ese nombre? (instantáneo si se primed). */
export function hasLspSymbolName(path: string, name: string): boolean {
  return lspSymbolNames.get(path)?.has(name) ?? false
}

/** true si ya se prefetcheó (aunque el server no haya devuelto nada). */
export function knowsLspSymbolNames(path: string): boolean {
  return lspSymbolNames.has(path)
}

/** El archivo cambió (guardado): la tabla puede estar vieja. */
export function invalidateLspSymbolNames(path?: string): void {
  if (path) lspSymbolNames.delete(path)
  else lspSymbolNames.clear()
}

/** Resuelve con el árbol y cae al LSP si el árbol no sabe. */
export async function resolveDefinitionTarget(
  path: string,
  position: { line: number; col: number }
): Promise<DefinitionTarget | null> {
  const tree = await resolveTreeTarget(position)
  if (tree) return tree

  const locations = await lspGoToDefinition(path, position.line, position.col)
  const first = locations[0]
  if (!first) return null
  const targetPath = decodeURIComponent(first.uri.replace(/^file:\/\//, ''))
  return {
    path: targetPath,
    line: first.range?.start?.line ?? 0,
    column: first.range?.start?.character ?? 0
  }
}

/** Lleva al destino: mismo archivo mueve el cursor; otro abre la tab. */
export function goToDefinitionTarget(target: DefinitionTarget): void {
  const { activePath } = getEditorFiles()
  if (activePath && target.path === activePath) {
    revealInnertaPosition(target.path, target.line, target.column)
    return
  }
  openFileInEditor(target.path, target.path.split(/[/\\]/).pop() ?? target.path)
  activateFile(target.path)
}

/** Columnas [inicio, fin) de la palabra en (line, col) — para subrayar. */
export function wordRangeAt(
  text: string,
  line: number,
  col: number
): { startCol: number; endCol: number } | null {
  const lines = text.split('\n')
  const target = lines[line]
  if (target === undefined) return null
  const isWordChar = (ch: string): boolean => /[A-Za-z0-9_$]/.test(ch)
  const clamped = Math.min(Math.max(col, 0), target.length)
  let at = clamped
  if (!(target[at] !== undefined && isWordChar(target[at]))) at = clamped - 1
  if (at < 0 || !isWordChar(target[at])) return null
  let start = at
  let end = at + 1
  while (start > 0 && isWordChar(target[start - 1])) start--
  while (end < target.length && isWordChar(target[end])) end++
  return { startCol: start, endCol: end }
}
