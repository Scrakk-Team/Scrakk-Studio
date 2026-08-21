import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  LLM_IPC,
  type LlmStreamDeltaEvent,
  type LlmStreamDoneEvent,
  type LlmStreamErrorEvent,
  type LlmStreamHandlers,
  type LlmStreamRequest,
  type LlmStreamToolCallsEvent
} from '@shared/llm'
import { FS_IPC, type PickFolderResponse, type PickFileResponse } from '@shared/fs'
import {
  LSP_IPC,
  type DiagnosticsChangedPayload,
  type DrainDiagnosticsRequest,
  type LspProgressPayload,
  type LspRequestPayload,
  type LspServerEventPayload,
  type LspServerStatus,
  type LspRequestResponse,
  type FileDiagnostics,
  type NotifyFileChangedRequest,
  type ReadDiagnosticsRequest,
  type RegisterDynamicServersRequest,
  type RemoveDynamicServersRequest,
  type RegisterDynamicServersResponse,
  type SetWorkspaceRequest,
  type SetWorkspaceResponse,
  type WorkspaceRootRequest
} from '@shared/lsp'
import { WINDOW_CONTROLS_IPC, type WindowApi } from '@shared/window-controls'
import {
  EXTENSIONS_IPC,
  type InstallSefResponse,
  type InstalledExtensionInfo,
  type PickSefResponse,
  type UninstallResponse
} from '@shared/extensions'

/**
 * Preload: puente seguro renderer ↔ main.
 * El renderer corre con contextIsolation + sandbox, sin nodeIntegration.
 */
const api: WindowApi = {
  windowControls: {
    minimize: () => ipcRenderer.send(WINDOW_CONTROLS_IPC.minimize),
    toggleMaximize: () => ipcRenderer.send(WINDOW_CONTROLS_IPC.toggleMaximize),
    close: () => ipcRenderer.send(WINDOW_CONTROLS_IPC.close),
    isMaximized: () => ipcRenderer.invoke(WINDOW_CONTROLS_IPC.isMaximized) as Promise<boolean>,
    setTitleBarOverlay: (options) => ipcRenderer.send(WINDOW_CONTROLS_IPC.setTitleBarOverlay, options),
    onMaximizedChange: (callback) => {
      const listener = (_event: IpcRendererEvent, maximized: boolean): void => {
        callback(maximized)
      }
      ipcRenderer.on(WINDOW_CONTROLS_IPC.maximizedChanged, listener)
      return () => {
        ipcRenderer.removeListener(WINDOW_CONTROLS_IPC.maximizedChanged, listener)
      }
    }
  },
  llm: {
    chatStream: (request: LlmStreamRequest, handlers: LlmStreamHandlers): (() => void) => {
      const matches = (payload: { requestId?: string }): boolean =>
        payload?.requestId === request.requestId

      const onChunk = (_event: IpcRendererEvent, payload: LlmStreamDeltaEvent): void => {
        if (matches(payload)) handlers.onContent?.(payload.delta)
      }
      const onReasoning = (_event: IpcRendererEvent, payload: LlmStreamDeltaEvent): void => {
        if (matches(payload)) handlers.onReasoning?.(payload.delta)
      }
      const onDone = (_event: IpcRendererEvent, payload: LlmStreamDoneEvent): void => {
        if (matches(payload)) handlers.onDone?.()
      }
      const onToolCalls = (_event: IpcRendererEvent, payload: LlmStreamToolCallsEvent): void => {
        if (matches(payload)) handlers.onToolCalls?.(payload.toolCalls)
      }
      const onError = (_event: IpcRendererEvent, payload: LlmStreamErrorEvent): void => {
        if (matches(payload)) handlers.onError?.(payload.error)
      }

      ipcRenderer.on(LLM_IPC.chatStreamChunk, onChunk)
      ipcRenderer.on(LLM_IPC.chatStreamReasoning, onReasoning)
      ipcRenderer.on(LLM_IPC.chatStreamToolCalls, onToolCalls)
      ipcRenderer.on(LLM_IPC.chatStreamDone, onDone)
      ipcRenderer.on(LLM_IPC.chatStreamError, onError)

      // Los listeners ya están registrados antes de arrancar → no se pierde
      // ningún delta temprano.
      void ipcRenderer.invoke(LLM_IPC.chatStreamStart, request)

      return () => {
        ipcRenderer.removeListener(LLM_IPC.chatStreamChunk, onChunk)
        ipcRenderer.removeListener(LLM_IPC.chatStreamReasoning, onReasoning)
        ipcRenderer.removeListener(LLM_IPC.chatStreamToolCalls, onToolCalls)
        ipcRenderer.removeListener(LLM_IPC.chatStreamDone, onDone)
        ipcRenderer.removeListener(LLM_IPC.chatStreamError, onError)
      }
    }
  },
  fs: {
    readFile: (path: string) => ipcRenderer.invoke(FS_IPC.readFile, { path }),
    writeFile: (path: string, content: string) => ipcRenderer.invoke(FS_IPC.writeFile, { path, content }),
    deleteFile: (path: string) => ipcRenderer.invoke(FS_IPC.deleteFile, { path }),
    moveFile: (source: string, destination: string) => ipcRenderer.invoke(FS_IPC.moveFile, { source, destination }),
    scanDirectory: (path: string, depth?: number) => ipcRenderer.invoke(FS_IPC.scanDirectory, { path, depth }),
    readdir: (path: string) => ipcRenderer.invoke(FS_IPC.readdir, { path }),
    mkdir: (path: string) => ipcRenderer.invoke(FS_IPC.mkdir, { path }),
    openInFolder: (path: string) => ipcRenderer.invoke(FS_IPC.openInFolder, { path }),
    watchDir: (path: string) => ipcRenderer.invoke(FS_IPC.watchDir, { path }),
    unwatchDir: (path: string) => ipcRenderer.invoke(FS_IPC.unwatchDir, { path }),
    onWatchChanged: (callback) => {
      const listener = (_event: IpcRendererEvent, payload: { path: string }): void => {
        callback({ path: payload.path })
      }
      ipcRenderer.on(FS_IPC.watchChanged, listener)
      return () => {
        ipcRenderer.removeListener(FS_IPC.watchChanged, listener)
      }
    },
    pickFolder: () => ipcRenderer.invoke(FS_IPC.pickFolder) as Promise<PickFolderResponse>,
    pickFile: () => ipcRenderer.invoke(FS_IPC.pickFile) as Promise<PickFileResponse>,
    homeDir: () => ipcRenderer.invoke(FS_IPC.homeDir) as Promise<string>,
    execCommand: (command: string, cwd?: string, timeoutMs?: number) => ipcRenderer.invoke(FS_IPC.execCommand, { command, cwd, timeoutMs }),
    searchFiles: (root: string, query: string, excludePattern?: string, maxResults?: number) => ipcRenderer.invoke(FS_IPC.searchFiles, { root, query, excludePattern, maxResults }),
    searchInFiles: (root: string, query: string, includePattern?: string, caseSensitive?: boolean, maxResults?: number) => ipcRenderer.invoke(FS_IPC.searchInFiles, { root, query, includePattern, caseSensitive, maxResults }),
    exists: (path: string) => ipcRenderer.invoke(FS_IPC.exists, { path }),
    stat: (path: string) => ipcRenderer.invoke(FS_IPC.stat, { path })
  },
  extensions: {
    installSef: (path: string) =>
      ipcRenderer.invoke(EXTENSIONS_IPC.installSef, { path }) as Promise<InstallSefResponse>,
    uninstall: (id: string) =>
      ipcRenderer.invoke(EXTENSIONS_IPC.uninstall, { id }) as Promise<UninstallResponse>,
    listInstalled: () =>
      ipcRenderer.invoke(EXTENSIONS_IPC.listInstalled) as Promise<InstalledExtensionInfo[]>,
    extensionsDir: () => ipcRenderer.invoke(EXTENSIONS_IPC.extensionsDir) as Promise<string>,
    pickSef: () => ipcRenderer.invoke(EXTENSIONS_IPC.pickSef) as Promise<PickSefResponse>
  },
  lsp: {
    setWorkspace: (rootPath: string) =>
      ipcRenderer.invoke(LSP_IPC.setWorkspace, { rootPath } satisfies SetWorkspaceRequest) as Promise<SetWorkspaceResponse>,
    addWorkspaceRoot: (rootPath: string) =>
      ipcRenderer.invoke(LSP_IPC.addWorkspaceRoot, { rootPath } satisfies WorkspaceRootRequest) as Promise<SetWorkspaceResponse>,
    removeWorkspaceRoot: (rootPath: string) =>
      ipcRenderer.invoke(LSP_IPC.removeWorkspaceRoot, { rootPath } satisfies WorkspaceRootRequest) as Promise<{ roots: string[] }>,
    listWorkspaceRoots: () => ipcRenderer.invoke(LSP_IPC.listWorkspaceRoots) as Promise<{ roots: string[] }>,
    status: () => ipcRenderer.invoke(LSP_IPC.status) as Promise<LspServerStatus[]>,
    request: (payload: LspRequestPayload) =>
      ipcRenderer.invoke(LSP_IPC.request, payload) as Promise<LspRequestResponse>,
    notifyFileChanged: (path: string, content: string) =>
      ipcRenderer.invoke(LSP_IPC.notifyFileChanged, { path, content } satisfies NotifyFileChangedRequest) as Promise<{ ok: boolean }>,
    notifyFileClosed: (path: string) =>
      ipcRenderer.invoke(LSP_IPC.notifyFileClosed, { path }) as Promise<{ ok: boolean }>,
    drainDiagnostics: (timeoutMs?: number) =>
      ipcRenderer.invoke(LSP_IPC.drainDiagnostics, { timeoutMs } satisfies DrainDiagnosticsRequest) as Promise<FileDiagnostics[]>,
    readDiagnostics: (paths: string[]) =>
      ipcRenderer.invoke(LSP_IPC.readDiagnostics, { paths } satisfies ReadDiagnosticsRequest) as Promise<FileDiagnostics[]>,
    shutdownAll: () => ipcRenderer.invoke(LSP_IPC.shutdownAll) as Promise<{ ok: boolean }>,
    registerDynamicServers: (sourceId: string, servers: RegisterDynamicServersRequest['servers']) =>
      ipcRenderer.invoke(LSP_IPC.registerDynamicServers, {
        sourceId,
        servers
      } satisfies RegisterDynamicServersRequest) as Promise<RegisterDynamicServersResponse>,
    removeDynamicServers: (sourceId: string) =>
      ipcRenderer.invoke(LSP_IPC.removeDynamicServers, { sourceId } satisfies RemoveDynamicServersRequest) as Promise<{ ok: boolean }>,
    onDiagnostics: (callback: (payload: DiagnosticsChangedPayload) => void) => {
      const listener = (_event: IpcRendererEvent, payload: DiagnosticsChangedPayload): void => callback(payload)
      ipcRenderer.on(LSP_IPC.onDiagnostics, listener)
      return () => {
        ipcRenderer.removeListener(LSP_IPC.onDiagnostics, listener)
      }
    },
    onServerEvent: (callback: (payload: LspServerEventPayload) => void) => {
      const listener = (_event: IpcRendererEvent, payload: LspServerEventPayload): void => callback(payload)
      ipcRenderer.on(LSP_IPC.onServerEvent, listener)
      return () => {
        ipcRenderer.removeListener(LSP_IPC.onServerEvent, listener)
      }
    },
    onProgress: (callback: (payload: LspProgressPayload) => void) => {
      const listener = (_event: IpcRendererEvent, payload: LspProgressPayload): void => callback(payload)
      ipcRenderer.on(LSP_IPC.onProgress, listener)
      return () => {
        ipcRenderer.removeListener(LSP_IPC.onProgress, listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
