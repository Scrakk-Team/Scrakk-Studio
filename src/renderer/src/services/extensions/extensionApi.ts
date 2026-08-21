/**
 * Extension API — superficie expuesta a los handlers de tipos (y base para
 * la futura API runtime de bundles .sef interactivos).
 *
 * Compuesta por namespaces: cada tipo decide qué exponer; el fs bridge y el
 * LSP van por IPC, así que acá no hay acceso a Node del renderer.
 */

import type { ExtensionTypeContext } from './types/handler'
import {
  lspStatus,
  lspRequest,
  lspReadDiagnostics,
  lspDrainDiagnostics,
  lspNotifyFileChanged,
  lspNotifyFileClosed
} from '@services/lsp'
import type { FileDiagnostics, LspRequestResponse, LspServerStatus } from '@shared/lsp'

export interface ExtensionLspApi {
  status(): Promise<LspServerStatus[]>
  /** Request genérico: definition/hover/references/… sobre un archivo. */
  request(payload: Parameters<typeof lspRequest>[0] extends never ? never : {
    method: string
    params?: unknown
    filePath?: string
    broadcast?: boolean
    serverName?: string
    timeoutMs?: number
  }): Promise<LspRequestResponse>
  readDiagnostics(paths: string[]): Promise<FileDiagnostics[]>
  drainDiagnostics(timeoutMs?: number): Promise<FileDiagnostics[]>
  notifyFileChanged(path: string, content: string): Promise<void>
  notifyFileClosed(path: string): Promise<void>
}

export interface ExtensionApi {
  /** LSP: navegación/diagnósticos para extensiones de código. */
  lsp: ExtensionLspApi
}

export function buildExtensionApi(): ExtensionApi {
  return {
    lsp: {
      status: () => lspStatus(),
      request: (payload) => lspRequest(payload.method, payload.params, payload),
      readDiagnostics: (paths) => lspReadDiagnostics(paths),
      drainDiagnostics: (timeoutMs) => lspDrainDiagnostics(timeoutMs),
      notifyFileChanged: async (path, content) => {
        await lspNotifyFileChanged(path, content)
      },
      notifyFileClosed: async (path) => {
        await lspNotifyFileClosed(path)
      }
    }
  }
}

/** Singleton: la API es stateless sobre IPC. */
let cached: ExtensionApi | null = null

/** ctx.api de cada registro de contribución (barato, cacheado). */
export function getExtensionApi(): ExtensionApi {
  if (!cached) cached = buildExtensionApi()
  return cached
}

/** Re-export para tipar el campo api de ExtensionTypeContext sin ciclos. */
export type { ExtensionTypeContext }
