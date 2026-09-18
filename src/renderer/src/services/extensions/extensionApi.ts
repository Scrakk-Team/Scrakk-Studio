/**
 * Extension API — superficie expuesta a los handlers de tipos (y base para
 * la futura API runtime de bundles .sef interactivos).
 *
 * GATEO POR PERMISOS (deny-by-default):
 *  - fs.* usa los canales escopados `ext:fs-*` cuyo enforcement real corre
 *    en el proceso main (jail al workspace + rutas sensibles bloqueadas).
 *  - lsp.* requiere el permiso "lsp.use".
 */

import {
  lspStatus,
  lspRequest,
  lspReadDiagnostics,
  lspDrainDiagnostics,
  lspNotifyFileChanged,
  lspNotifyFileClosed
} from '@services/lsp'
import { showTooltip, hideTooltip, type TooltipRequest } from '@services/tooltips'
import {
  notify,
  dismissNotification,
  type NotifyInput
} from '@services/notifications'
import type {
  FileDiagnostics,
  LspRequestResponse,
  LspServerStatus
} from '@shared/lsp'
import { PERMISSIONS } from '@shared/permissions'

export interface ExtensionLspApi {
  status(): Promise<LspServerStatus[]>
  /** Request genérico: definition/hover/references/… sobre un archivo. */
  request(payload: {
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

export interface ExtensionFsApi {
  readFile(path: string): Promise<{ success: boolean; content?: string; error?: string }>
  writeFile(path: string, content: string): Promise<{ success: boolean; error?: string }>
}

export interface ExtensionTooltipApi {
  show(request: TooltipRequest): void
  hide(): void
}

export interface ExtensionNotificationsApi {
  /** Muestra una notificación (4 esquinas, ≤3 acciones, imagen ≤500×500). */
  show(input: NotifyInput): string
  dismiss(id: string): void
}

export interface ExtensionApi {
  /** FS enjaulado: solo workspace, rutas sensibles bloqueadas (main). */
  fs: ExtensionFsApi
  /** LSP: navegación/diagnósticos para extensiones de código. */
  lsp: ExtensionLspApi
  /** Tooltips con estilo del tema (para cualquier UI de la extensión). */
  tooltips: ExtensionTooltipApi
  /** Notificaciones globales (mismo registry que usa la app). */
  notifications: ExtensionNotificationsApi
}

export interface BuildExtensionApiOptions {
  extensionId: string
  /** Permisos declarados en el manifest (deny-by-default). */
  permissions?: string[]
}

function permissionError(permission: string): Error {
  return new Error(`[permisos] la extensión no declara "${permission}"`)
}

export function buildExtensionApi(options: BuildExtensionApiOptions): ExtensionApi {
  const declared = options.permissions ?? []

  const gatedLsp = (): ExtensionLspApi => {
    if (!declared.includes(PERMISSIONS.LSP_USE)) {
      throw permissionError(PERMISSIONS.LSP_USE)
    }
    return rawLsp
  }

  // El fs SIEMPRE se expone vía canales escopados — main es el que decide.
  const fsApi: ExtensionFsApi = {
    readFile: (path) =>
      window.api.extensions.fsFor(options.extensionId).readFile(path),
    writeFile: (path, content) =>
      window.api.extensions.fsFor(options.extensionId).writeFile(path, content)
  }

  // Proxy perezoso: lanzar PermissionError al USAR lsp sin permiso.
  const rawLsp: ExtensionLspApi = {
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

  return {
    fs: fsApi,
    get lsp(): ExtensionLspApi {
      return gatedLsp()
    },
    tooltips: {
      show: (request) => showTooltip(request),
      hide: () => hideTooltip()
    },
    notifications: {
      show: (input) => notify(input),
      dismiss: (id) => dismissNotification(id)
    }
  }
}

// Tipos expuestos para firmas de extensiones.
export type { NotificationCorner, NotificationImage, NotificationSeverity } from '@services/notifications/types'
