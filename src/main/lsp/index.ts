/**
 * LSP — registro de handlers IPC.
 *
 * Mismo patrón que ipc/fs.ts. Los eventos push (diagnósticos, estado de
 * servers y progreso $/progress) se difunden a todas las ventanas vivas.
 */

import { BrowserWindow, ipcMain } from 'electron'
import {
  LSP_IPC,
  type DiagnosticsChangedPayload,
  type DrainDiagnosticsRequest,
  type LspProgressPayload,
  type LspRequestPayload,
  type LspServerEventPayload,
  type NotifyFileChangedRequest,
  type ReadDiagnosticsRequest,
  type RegisterDynamicServersRequest,
  type RemoveDynamicServersRequest,
  type SetDisabledServersRequest,
  type SetWorkspaceRequest,
  type SetWorkspaceResponse,
  type WorkspaceRootRequest
} from '@shared/lsp'
import { LspManager, setDynamicRootMarkers } from './manager'
import { setPermissionWorkspaceRoots } from '../extensions/permissions'
import {
  providerQueryFromLspRequest,
  queryExtensionProviders,
  toLspResults
} from '../extensions/providerBridge'

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

const manager = new LspManager(
  (payload: LspServerEventPayload) => {
    broadcast(LSP_IPC.onServerEvent, payload)
  },
  (payload: DiagnosticsChangedPayload) => {
    broadcast(LSP_IPC.onDiagnostics, payload)
  },
  (payload: LspProgressPayload) => {
    broadcast(LSP_IPC.onProgress, payload)
  }
)

export function registerLspIpc(): void {
  ipcMain.handle(
    LSP_IPC.setWorkspace,
    async (_event, request: SetWorkspaceRequest): Promise<SetWorkspaceResponse> => {
      try {
        const servers = await manager.setWorkspace(request.rootPath)
        setPermissionWorkspaceRoots([request.rootPath])
        return { ok: true, servers }
      } catch (error) {
        return { ok: false, servers: [], error: String(error) }
      }
    }
  )

  ipcMain.handle(
    LSP_IPC.addWorkspaceRoot,
    async (_event, request: WorkspaceRootRequest): Promise<SetWorkspaceResponse> => {
      try {
        const roots = await manager.addWorkspaceRoot(request.rootPath)
        return { ok: true, servers: roots }
      } catch (error) {
        return { ok: false, servers: [], error: String(error) }
      }
    }
  )

  ipcMain.handle(
    LSP_IPC.removeWorkspaceRoot,
    (_event, request: WorkspaceRootRequest) =>
      manager.removeWorkspaceRoot(request.rootPath).then((roots) => ({ roots }))
  )

  ipcMain.handle(LSP_IPC.listWorkspaceRoots, () => ({ roots: manager.listRoots() }))

  // Tipo de extensión 'lspServers'.
  ipcMain.handle(
    LSP_IPC.registerDynamicServers,
    (_event, request: RegisterDynamicServersRequest): { ok: boolean; registered: string[] } => {
      for (const def of request.servers ?? []) {
        setDynamicRootMarkers(def.id, def.rootMarkers)
      }
      const registered = manager.registerDynamicServers(request.sourceId, request.servers ?? [])
      return { ok: true, registered }
    }
  )

  ipcMain.handle(
    LSP_IPC.removeDynamicServers,
    (_event, request: RemoveDynamicServersRequest) => {
      manager.removeDynamicServers(request.sourceId)
      return { ok: true }
    }
  )

  ipcMain.handle(LSP_IPC.status, () => manager.status())

  /**
   * Servers apagados por el usuario. El renderer los persiste (Ajustes) y los
   * empuja aquí al arrancar y en cada cambio; el manager los respeta al cargar
   * configs, así que un server apagado no arranca de verdad.
   */
  ipcMain.handle(
    LSP_IPC.setDisabledServers,
    async (_event, request: SetDisabledServersRequest): Promise<{ ok: boolean }> => {
      await manager.setDisabledServers(request?.ids ?? [])
      return { ok: true }
    }
  )

  ipcMain.handle(LSP_IPC.getDisabledServers, () => ({ ids: manager.disabledServerIds() }))

  /**
   * Requests LSP: al `LspManager` (servers del sistema / de `.scrakk/lsp.json`)
   * y, si el pedido tiene equivalente, a los PROVEEDORES de las extensiones.
   *
   * Los dos caminos responden lo mismo porque el contrato es el del LSP: una
   * extensión que arranca su server con `vscode-languageclient` responde por
   * `lsp:request` igual que un server del sistema. Sin esto, la mitad (la más
   * común) de los language servers no llegaba al editor.
   */
  ipcMain.handle(LSP_IPC.request, async (_event, payload: LspRequestPayload) => {
    const fromServers = await manager.request(payload)
    const query = providerQueryFromLspRequest(payload.method, payload.params)
    if (!query || payload.broadcast) return fromServers
    const answers = await queryExtensionProviders(query)
    if (answers.length === 0) return fromServers
    return {
      ...fromServers,
      ok: true,
      results: [...fromServers.results, ...toLspResults(answers)]
    }
  })

  ipcMain.handle(
    LSP_IPC.notifyFileChanged,
    (_event, request: NotifyFileChangedRequest) =>
      manager.notifyFileChanged(request.path, request.content).then(() => ({ ok: true }))
  )

  ipcMain.handle(
    LSP_IPC.notifyFileClosed,
    (_event, request: { path: string }) =>
      manager.notifyFileClosed(request.path).then(() => ({ ok: true }))
  )

  ipcMain.handle(
    LSP_IPC.drainDiagnostics,
    (_event, request: DrainDiagnosticsRequest | undefined) => manager.drainDiagnostics(request?.timeoutMs)
  )

  ipcMain.handle(
    LSP_IPC.readDiagnostics,
    (_event, request: ReadDiagnosticsRequest) => manager.readDiagnostics(request.paths)
  )

  ipcMain.handle(LSP_IPC.shutdownAll, () => manager.shutdownAll().then(() => ({ ok: true })))

  ipcMain.handle(
    LSP_IPC.restartServer,
    (_event, request: { serverName: string }) => manager.restartServer(request.serverName)
  )

  ipcMain.handle(
    LSP_IPC.installServer,
    (_event, request: { serverName: string }) => manager.installNow(request.serverName)
  )
}

/** Acceso directo al manager (para tests y futuros módulos main). */
export function getLspManager(): LspManager {
  return manager
}
