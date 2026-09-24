// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Puente de proveedores de lenguaje (main).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA DE LOS DOS RUNTIMES
 *
 * Un language server puede vivir en DOS lugares:
 *
 *   1. **En el `LspManager`** (server del sistema o instalado por receta, con
 *      config declarativa en `.scrakk/lsp.json`). Ese camino ya existía.
 *   2. **Dentro del Extension Host**, porque la extensión lo arrancó con
 *      `vscode-languageclient` (o aporta el provider sin server). Ese es el
 *      caso de la mayoría de las extensiones reales y hasta hoy no llegaba a
 *      ninguna parte.
 *
 * El IDE pregunta por el canal del LSP (`lsp:request`) porque es su única
 * superficie para "dame el hover de esta posición". Este módulo es el que
 * permite que esa misma pregunta llegue a los hosts de extensiones, sin que el
 * `LspManager` sepa que existen: el IPC del LSP consulta aquí y AGREGA.
 *
 * Por qué un registro de una sola función y no un mapa por extensión: el dueño
 * de los hosts es el IPC del Extension Host (`hostManager`), y ese módulo
 * registra aquí UNA función que sabe recorrerlos. Así este archivo no importa
 * nada de extensiones (y no se crea un ciclo con el IPC del LSP).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * No conoce Electron, ni Node, ni stdio: es una tabla de una función + un
 * timeout. Si Owear reemplaza al host, esto queda igual.
 */

import type {
  LanguageProviderKind,
  ProviderPosition,
  ProviderQueryResult,
  ProviderRange
} from '@shared/extensionHost/protocol'

/** Consulta en términos del protocolo (el host arma el `TextDocument`). */
export interface ExtensionProviderQuery {
  kind: LanguageProviderKind
  path: string
  position?: ProviderPosition
  range?: ProviderRange
  context?: { includeDeclaration?: boolean }
  options?: { tabSize?: number; insertSpaces?: boolean }
}

/** Respuesta de UNA extensión (host) a la consulta. */
export interface ExtensionProviderAnswer {
  extensionId: string
  result: unknown
}

export type ExtensionProvidersQueryFn = (
  query: ExtensionProviderQuery
) => Promise<ExtensionProviderAnswer[]>

/**
 * Presupuesto de una consulta.
 *
 * Un proveedor puede hacer trabajo largo de verdad (resolver un proyecto
 * entero). El hover del editor NO puede esperarlo: pasarse se ve como un editor
 * congelado. Se corta y se devuelve lo que haya; el server sigue vivo.
 */
const QUERY_TIMEOUT_MS = 5000

let queryFn: ExtensionProvidersQueryFn | null = null

/** Lo registra el IPC del Extension Host (una vez, al arrancar la app). */
export function setExtensionProvidersQueryFn(next: ExtensionProvidersQueryFn | null): void {
  queryFn = next
}

/** ¿Hay quién pueda responder? (para no pagar el camino si no hay hosts). */
export function hasExtensionProviders(): boolean {
  return queryFn !== null
}

/**
 * Consulta a TODAS las extensiones con host y devuelve las que opinan.
 *
 * Las que no registraron un proveedor para ese tipo no aparecen: el host
 * responde `matched: false` y aquí se filtra, así el llamador no tiene que
 * adivinar de quién es cada respuesta.
 */
export async function queryExtensionProviders(
  query: ExtensionProviderQuery
): Promise<ExtensionProviderAnswer[]> {
  if (!queryFn) return []
  let timer: NodeJS.Timeout | null = null
  try {
    const answers = await Promise.race([
      queryFn(query),
      new Promise<ExtensionProviderAnswer[]>((resolve) => {
        timer = setTimeout(() => {
          console.warn(
            `[providers] la consulta de ${query.kind} para ${query.path} se pasó de ${QUERY_TIMEOUT_MS}ms`
          )
          resolve([])
        }, QUERY_TIMEOUT_MS)
      })
    ])
    return answers.filter((answer) => answer && answer.result !== undefined)
  } catch (error) {
    console.warn(
      `[providers] la consulta de ${query.kind} falló: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return []
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ── Métodos del LSP ⇄ tipos de proveedor ──────────────────────────────────

/**
 * Qué método del protocolo LSP se responde con qué proveedor del API.
 *
 * Sólo los que el editor pide HOY: `textDocument/completion` o los tokens
 * semánticos no están en la lista porque su UI no existe (ver
 * `languageProviders.ts`).
 */
export const PROVIDER_METHODS: Record<string, LanguageProviderKind> = {
  'textDocument/hover': 'hover',
  'textDocument/definition': 'definition',
  'textDocument/declaration': 'declaration',
  'textDocument/implementation': 'implementation',
  'textDocument/typeDefinition': 'typeDefinition',
  'textDocument/references': 'references',
  'textDocument/documentHighlight': 'documentHighlight',
  'textDocument/formatting': 'formatting',
  'textDocument/rangeFormatting': 'rangeFormatting'
}

/** `file:///ruta/a.ts` → `/ruta/a.ts` (con `%20` y demás des-escapados). */
export function fileUriToPath(uri: string): string {
  const withoutScheme = uri.replace(/^file:\/\//, '')
  try {
    return decodeURIComponent(withoutScheme)
  } catch {
    // Una URI con `%` suelto no es un error que deba romper la consulta.
    return withoutScheme
  }
}

interface LspLikeParams {
  textDocument?: { uri?: unknown }
  position?: { line?: unknown; character?: unknown }
  range?: { start?: unknown; end?: unknown }
  context?: { includeDeclaration?: unknown }
  options?: { tabSize?: unknown; insertSpaces?: unknown }
}

function toPosition(raw: unknown): ProviderPosition | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const position = raw as { line?: unknown; character?: unknown }
  if (typeof position.line !== 'number' || typeof position.character !== 'number') return undefined
  return { line: position.line, character: position.character }
}

function toRange(raw: unknown): ProviderRange | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const range = raw as { start?: unknown; end?: unknown }
  const start = toPosition(range.start)
  const end = toPosition(range.end)
  if (!start || !end) return undefined
  return { start, end }
}

/**
 * Traduce un pedido del LSP a una consulta de proveedores.
 * `null` = ese pedido no tiene equivalente (o no es de un documento).
 */
export function providerQueryFromLspRequest(
  method: string,
  params: unknown
): ExtensionProviderQuery | null {
  const kind = PROVIDER_METHODS[method]
  if (!kind) return null
  const parsed = (params ?? {}) as LspLikeParams
  const uri = parsed.textDocument?.uri
  if (typeof uri !== 'string' || !uri.startsWith('file://')) return null
  const position = toPosition(parsed.position)
  const range = toRange(parsed.range)
  const includeDeclaration = parsed.context?.includeDeclaration
  const options =
    kind === 'formatting' || kind === 'rangeFormatting'
      ? {
          tabSize: typeof parsed.options?.tabSize === 'number' ? parsed.options.tabSize : undefined,
          insertSpaces:
            typeof parsed.options?.insertSpaces === 'boolean' ? parsed.options.insertSpaces : undefined
        }
      : undefined

  return {
    kind,
    path: fileUriToPath(uri),
    ...(position ? { position } : {}),
    ...(range ? { range } : {}),
    ...(typeof includeDeclaration === 'boolean' ? { context: { includeDeclaration } } : {}),
    ...(options ? { options } : {})
  }
}

/** Respuesta del host normalizada (lo que se agrega a `LspRequestResponse`). */
export interface ExtensionProviderEntry {
  serverName: string
  result: unknown
}

/** Convierte las respuestas de extensiones a la forma del canal del LSP. */
export function toLspResults(
  answers: ReadonlyArray<ExtensionProviderAnswer>
): ExtensionProviderEntry[] {
  return answers.map((answer) => ({ serverName: answer.extensionId, result: answer.result }))
}

export type { ProviderQueryResult }
