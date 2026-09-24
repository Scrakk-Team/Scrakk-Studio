// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  LLM_IPC,
  type LlmStreamDeltaEvent,
  type LlmStreamDoneEvent,
  type LlmStreamErrorEvent,
  type LlmStreamHandlers,
  type LlmStreamRequest,
  type LlmStreamStoppedEvent,
  type LlmStreamToolCallsEvent
} from '@shared/llm'
import { FS_IPC, type PickFolderResponse, type PickFileResponse } from '@shared/fs'
import {
  UPDATES_IPC,
  type CheckLatestRequest,
  type ReleaseInfo,
  type UpdateCheckResponse,
  type UpdaterState
} from '@shared/updates'
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
  type SetDisabledServersRequest,
  type SetWorkspaceRequest,
  type LspServerActionResult,
  type SetWorkspaceResponse,
  type WorkspaceRootRequest
} from '@shared/lsp'
import { WINDOW_CONTROLS_IPC, type WindowApi } from '@shared/window-controls'
import { SCREENSHOT_IPC } from '@shared/screenshot'
import { ACCOUNT_IPC } from '@shared/account'
import { MODELS_DEV_IPC, type ModelsDevCatalog } from '@shared/modelsDev'
import { WEB_IPC, type WebFetchRequest, type WebSearchRequest } from '@shared/web'
import {
  SCRAKK_FS_IPC,
  type ScrakkChangeEvent,
  type ScrakkOp,
  type ScrakkWriteJsonOp,
  type ScrakkWriteOp
} from '@shared/scrakk'
import {
  SOCIAL_IPC,
  type AccountEvent,
  type ImageUpload,
  type IncomingMessageEvent,
  type MessageDeleteEvent,
  type MessageUpdateEvent,
  type PresenceActivity,
  type PresenceStatus,
  type TypingEvent
} from '@shared/social'
import {
  ENCODINGS_IPC,
  type ReadEncodedRequest,
  type WriteEncodedRequest
} from '@shared/encodings'
import { TERMINAL_IPC, type TerminalCreateRequest, type TerminalWriteRequest, type TerminalResizeRequest, type TerminalDestroyRequest } from '@shared/terminal'
import { GIT_IPC, type GitApi } from '@shared/git'
import {
  EXTENSIONS_IPC,
  type InstallSefResponse,
  type InstallVsixResponse,
  type InstalledExtensionInfo,
  type PickSefResponse,
  type PickVsixResponse,
  type UninstallResponse,
  EXT_FS_IPC,
  EXTENSION_HOST_IPC,
  type ScopedFsReadResponse,
  type ScopedFsWriteRequest,
  type HostEnsureRequest,
  type HostEnsureResponse,
  type HostViewRequest,
  type HostViewMessageRequest,
  type HostResolveViewResponse,
  type HostTreeChildrenRequest,
  type HostTreeChildrenResponse,
  type HostTreeSelectRequest,
  type HostTreeSelectResponse,
  type HostSimpleResponse,
  type HostCommandRequest,
  type HostCommandResponse,
  type HostEventMessage,
  type HostInvokeRequest,
  type HostInvokeResult,
  type DocumentEvent,
  type TokenizeRequest,
  type TokenizeResult,
  type DynamicTokenizeRequest,
  type DynamicTokenizeResult
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
  // Capturas: las hace el main porque el canvas del editor es WebGL (sus
  // píxeles no se pueden leer desde el renderer).
  screenshot: {
    capture: (request) => ipcRenderer.invoke(SCREENSHOT_IPC.capture, request)
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
      const onStopped = (_event: IpcRendererEvent, payload: LlmStreamStoppedEvent): void => {
        if (matches(payload)) handlers.onStopped?.()
      }
      const onError = (_event: IpcRendererEvent, payload: LlmStreamErrorEvent): void => {
        if (matches(payload)) handlers.onError?.(payload.error)
      }

      ipcRenderer.on(LLM_IPC.chatStreamChunk, onChunk)
      ipcRenderer.on(LLM_IPC.chatStreamReasoning, onReasoning)
      ipcRenderer.on(LLM_IPC.chatStreamToolCalls, onToolCalls)
      ipcRenderer.on(LLM_IPC.chatStreamDone, onDone)
      ipcRenderer.on(LLM_IPC.chatStreamStopped, onStopped)
      ipcRenderer.on(LLM_IPC.chatStreamError, onError)

      // Los listeners ya están registrados antes de arrancar → no se pierde
      // ningún delta temprano.
      void ipcRenderer.invoke(LLM_IPC.chatStreamStart, request)

      return () => {
        ipcRenderer.removeListener(LLM_IPC.chatStreamChunk, onChunk)
        ipcRenderer.removeListener(LLM_IPC.chatStreamReasoning, onReasoning)
        ipcRenderer.removeListener(LLM_IPC.chatStreamToolCalls, onToolCalls)
        ipcRenderer.removeListener(LLM_IPC.chatStreamDone, onDone)
        ipcRenderer.removeListener(LLM_IPC.chatStreamStopped, onStopped)
        ipcRenderer.removeListener(LLM_IPC.chatStreamError, onError)
      }
    },
    stopStream: (requestId: string): void => {
      ipcRenderer.send(LLM_IPC.chatStreamStop, { requestId })
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
    installVsix: (path: string) =>
      ipcRenderer.invoke(EXTENSIONS_IPC.installVsix, { path }) as Promise<InstallVsixResponse>,
    uninstall: (id: string) =>
      ipcRenderer.invoke(EXTENSIONS_IPC.uninstall, { id }) as Promise<UninstallResponse>,
    listInstalled: () =>
      ipcRenderer.invoke(EXTENSIONS_IPC.listInstalled) as Promise<InstalledExtensionInfo[]>,
    extensionsDir: () => ipcRenderer.invoke(EXTENSIONS_IPC.extensionsDir) as Promise<string>,
    pickSef: () => ipcRenderer.invoke(EXTENSIONS_IPC.pickSef) as Promise<PickSefResponse>,
    pickVsix: () => ipcRenderer.invoke(EXTENSIONS_IPC.pickVsix) as Promise<PickVsixResponse>,
    retranslateVsix: () =>
      ipcRenderer.invoke(EXTENSIONS_IPC.retranslateVsix) as Promise<{
        success: boolean
        updated: string[]
        skipped: string[]
      }>,
    tokenize: (request: TokenizeRequest) =>
      ipcRenderer.invoke(EXTENSIONS_IPC.tokenize, request) as Promise<TokenizeResult>,
    tokenizeDynamic: (request: DynamicTokenizeRequest) =>
      ipcRenderer.invoke(EXTENSIONS_IPC.tokenizeDynamic, request) as Promise<DynamicTokenizeResult>,
    fsFor: (extensionId: string) => ({
      readFile: (path: string) =>
        ipcRenderer.invoke(EXT_FS_IPC.read, { extensionId, path }) as Promise<ScopedFsReadResponse>,
      writeFile: (path: string, content: string) =>
        ipcRenderer.invoke(EXT_FS_IPC.write, {
          extensionId,
          path,
          content
        } satisfies ScopedFsWriteRequest) as Promise<{ success: boolean; error?: string }>
    }),
    // Extension Host: ejecución del CÓDIGO de la extensión en su proceso.
    // El renderer nunca habla con ese proceso — el main valida y rutea.
    host: {
      ensure: (request: HostEnsureRequest) =>
        ipcRenderer.invoke(EXTENSION_HOST_IPC.ensure, request) as Promise<HostEnsureResponse>,
      resolveView: (request: HostViewRequest) =>
        ipcRenderer.invoke(EXTENSION_HOST_IPC.resolveView, request) as Promise<HostResolveViewResponse>,
      treeChildren: (request: HostTreeChildrenRequest) =>
        ipcRenderer.invoke(EXTENSION_HOST_IPC.treeChildren, request) as Promise<HostTreeChildrenResponse>,
      treeSelect: (request: HostTreeSelectRequest) =>
        ipcRenderer.invoke(EXTENSION_HOST_IPC.treeSelect, request) as Promise<HostTreeSelectResponse>,
      disposeView: (request: HostViewRequest) =>
        ipcRenderer.invoke(EXTENSION_HOST_IPC.disposeView, request) as Promise<HostSimpleResponse>,
      viewMessage: (request: HostViewMessageRequest) =>
        ipcRenderer.invoke(EXTENSION_HOST_IPC.viewMessage, request) as Promise<HostSimpleResponse>,
      executeCommand: (request: HostCommandRequest) =>
        ipcRenderer.invoke(EXTENSION_HOST_IPC.executeCommand, request) as Promise<HostCommandResponse>,
      shutdown: (id: string) =>
        ipcRenderer.invoke(EXTENSION_HOST_IPC.shutdown, { id }) as Promise<HostSimpleResponse>,
      webviewUrl: (request: HostViewRequest) =>
        ipcRenderer.invoke(EXTENSION_HOST_IPC.webviewUrl, request) as Promise<string>,
      panelUrl: (request: { id: string; panelId: string }) =>
        ipcRenderer.invoke(EXTENSION_HOST_IPC.panelUrl, request) as Promise<string>,
      panelClose: (request: { id: string; panelId: string }) =>
        ipcRenderer.invoke(EXTENSION_HOST_IPC.panelClose, request) as Promise<HostSimpleResponse>,
      onEvent: (listener: (message: HostEventMessage) => void) => {
        const handler = (_event: IpcRendererEvent, payload: HostEventMessage): void =>
          listener(payload)
        ipcRenderer.on(EXTENSION_HOST_IPC.event, handler)
        return () => {
          ipcRenderer.removeListener(EXTENSION_HOST_IPC.event, handler)
        }
      },
      onInvoke: (listener: (request: HostInvokeRequest) => void) => {
        const handler = (_event: IpcRendererEvent, payload: HostInvokeRequest): void =>
          listener(payload)
        ipcRenderer.on(EXTENSION_HOST_IPC.invoke, handler)
        return () => {
          ipcRenderer.removeListener(EXTENSION_HOST_IPC.invoke, handler)
        }
      },
      respondInvoke: (result: HostInvokeResult) =>
        ipcRenderer.send(EXTENSION_HOST_IPC.invokeResult, result),
      signalReady: () => ipcRenderer.send(EXTENSION_HOST_IPC.uiReady),
      setTelemetryEnabled: (enabled: boolean) =>
        ipcRenderer.send(EXTENSION_HOST_IPC.telemetry, { enabled }),
      syncDocuments: (events: DocumentEvent[]) =>
        ipcRenderer.send(EXTENSION_HOST_IPC.docSync, events)
    }
  },
  updates: {
    getLatest: () => ipcRenderer.invoke(UPDATES_IPC.getLatest) as Promise<UpdateCheckResponse>,
    checkLatest: (repo?: string) =>
      ipcRenderer.invoke(UPDATES_IPC.checkLatest, { repo } satisfies CheckLatestRequest) as Promise<UpdateCheckResponse>,
    updaterState: () => ipcRenderer.invoke(UPDATES_IPC.updaterStateGet) as Promise<UpdaterState>,
    updaterCheck: () => ipcRenderer.invoke(UPDATES_IPC.updaterCheck) as Promise<UpdaterState>,
    updaterDownload: () => ipcRenderer.invoke(UPDATES_IPC.updaterDownload) as Promise<UpdaterState>,
    updaterInstall: () => ipcRenderer.invoke(UPDATES_IPC.updaterInstall) as Promise<void>,
    onRelease: (listener: (release: ReleaseInfo) => void) => {
      const handler = (_event: IpcRendererEvent, release: ReleaseInfo): void => listener(release)
      ipcRenderer.on(UPDATES_IPC.onRelease, handler)
      return () => {
        ipcRenderer.removeListener(UPDATES_IPC.onRelease, handler)
      }
    },
    onUpdaterState: (listener: (state: UpdaterState) => void) => {
      const handler = (_event: IpcRendererEvent, state: UpdaterState): void => listener(state)
      ipcRenderer.on(UPDATES_IPC.onUpdaterState, handler)
      return () => {
        ipcRenderer.removeListener(UPDATES_IPC.onUpdaterState, handler)
      }
    }
  },
  encodings: {
    readEncoded: (path: string) =>
      ipcRenderer.invoke(ENCODINGS_IPC.readEncoded, { path } satisfies ReadEncodedRequest) as Promise<
        import('@shared/encodings').ReadEncodedResponse
      >,
    writeEncoded: (request: WriteEncodedRequest) =>
      ipcRenderer.invoke(ENCODINGS_IPC.writeEncoded, request satisfies WriteEncodedRequest) as Promise<
        import('@shared/encodings').WriteEncodedResult
      >,
    list: () => ipcRenderer.invoke(ENCODINGS_IPC.list) as Promise<import('@shared/encodings').ListEncodingsResponse>,
    registerDynamic: (extensionId, codecs) =>
      ipcRenderer.invoke(ENCODINGS_IPC.registerDynamic, {
        extensionId,
        codecs
      } satisfies import('@shared/encodings').RegisterDynamicCodecsRequest) as Promise<
        import('@shared/encodings').RegisterDynamicCodecsResponse
      >,
    removeDynamic: (extensionId: string) =>
      ipcRenderer.invoke(ENCODINGS_IPC.removeDynamic, {
        extensionId
      } satisfies import('@shared/encodings').RemoveDynamicCodecsRequest) as Promise<{
        success: boolean
        removed?: string[]
      }>
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
    restartServer: (serverName: string) =>
      ipcRenderer.invoke(LSP_IPC.restartServer, { serverName }) as Promise<LspServerActionResult>,
    installServer: (serverName: string) =>
      ipcRenderer.invoke(LSP_IPC.installServer, { serverName }) as Promise<LspServerActionResult>,
    registerDynamicServers: (sourceId: string, servers: RegisterDynamicServersRequest['servers']) =>
      ipcRenderer.invoke(LSP_IPC.registerDynamicServers, {
        sourceId,
        servers
      } satisfies RegisterDynamicServersRequest) as Promise<RegisterDynamicServersResponse>,
    removeDynamicServers: (sourceId: string) =>
      ipcRenderer.invoke(LSP_IPC.removeDynamicServers, { sourceId } satisfies RemoveDynamicServersRequest) as Promise<{ ok: boolean }>,
    setDisabledServers: (ids: string[]) =>
      ipcRenderer.invoke(LSP_IPC.setDisabledServers, { ids } satisfies SetDisabledServersRequest) as Promise<{ ok: boolean }>,
    getDisabledServers: () =>
      ipcRenderer.invoke(LSP_IPC.getDisabledServers) as Promise<{ ids: string[] }>,
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
  },
  terminal: {
    create: (req: TerminalCreateRequest) => ipcRenderer.invoke(TERMINAL_IPC.create, req) as Promise<{ success: boolean; error?: string }>,
    write: (req: TerminalWriteRequest) => ipcRenderer.invoke(TERMINAL_IPC.write, req) as Promise<void>,
    resize: (req: TerminalResizeRequest) => ipcRenderer.invoke(TERMINAL_IPC.resize, req) as Promise<void>,
    destroy: (req: TerminalDestroyRequest) => ipcRenderer.invoke(TERMINAL_IPC.destroy, req) as Promise<void>,
    onData: (callback) => {
      const listener = (_event: IpcRendererEvent, payload: import('@shared/terminal').TerminalDataPayload): void => callback(payload)
      ipcRenderer.on(TERMINAL_IPC.onData, listener)
      return () => ipcRenderer.removeListener(TERMINAL_IPC.onData, listener)
    },
    onExit: (callback) => {
      const listener = (_event: IpcRendererEvent, payload: import('@shared/terminal').TerminalExitPayload): void => callback(payload)
      ipcRenderer.on(TERMINAL_IPC.onExit, listener)
      return () => ipcRenderer.removeListener(TERMINAL_IPC.onExit, listener)
    },
    getMonoFont: () => ipcRenderer.invoke(TERMINAL_IPC.getMonoFont) as Promise<{ data: number[] } | null>
  },
  git: {
    version: () => ipcRenderer.invoke(GIT_IPC.version),
    detectRepos: (req) => ipcRenderer.invoke(GIT_IPC.detectRepos, req),
    status: (req) => ipcRenderer.invoke(GIT_IPC.status, req),
    log: (req) => ipcRenderer.invoke(GIT_IPC.log, req),
    branches: (req) => ipcRenderer.invoke(GIT_IPC.branches, req),
    reflog: (req) => ipcRenderer.invoke(GIT_IPC.reflog, req),
    diffNumstat: (req) => ipcRenderer.invoke(GIT_IPC.diffNumstat, req),
    showCommit: (req) => ipcRenderer.invoke(GIT_IPC.showCommit, req),
    stage: (req) => ipcRenderer.invoke(GIT_IPC.stage, req),
    unstage: (req) => ipcRenderer.invoke(GIT_IPC.unstage, req),
    discard: (req) => ipcRenderer.invoke(GIT_IPC.discard, req),
    commit: (req) => ipcRenderer.invoke(GIT_IPC.commit, req),
    checkout: (req) => ipcRenderer.invoke(GIT_IPC.checkout, req),
    branchCreate: (req) => ipcRenderer.invoke(GIT_IPC.branchCreate, req),
    branchDelete: (req) => ipcRenderer.invoke(GIT_IPC.branchDelete, req),
    branchRename: (req) => ipcRenderer.invoke(GIT_IPC.branchRename, req),
    push: (req) => ipcRenderer.invoke(GIT_IPC.push, req),
    pull: (req) => ipcRenderer.invoke(GIT_IPC.pull, req),
    fetch: (req) => ipcRenderer.invoke(GIT_IPC.fetch, req),
    remotes: (req) => ipcRenderer.invoke(GIT_IPC.remotes, req),
    remoteAdd: (req) => ipcRenderer.invoke(GIT_IPC.remoteAdd, req),
    remoteRemove: (req) => ipcRenderer.invoke(GIT_IPC.remoteRemove, req),
    stashList: (req) => ipcRenderer.invoke(GIT_IPC.stashList, req),
    stashPush: (req) => ipcRenderer.invoke(GIT_IPC.stashPush, req),
    stashPop: (req) => ipcRenderer.invoke(GIT_IPC.stashPop, req),
    stashApply: (req) => ipcRenderer.invoke(GIT_IPC.stashApply, req),
    stashDrop: (req) => ipcRenderer.invoke(GIT_IPC.stashDrop, req),
    tags: (req) => ipcRenderer.invoke(GIT_IPC.tags, req),
    tagCreate: (req) => ipcRenderer.invoke(GIT_IPC.tagCreate, req),
    tagDelete: (req) => ipcRenderer.invoke(GIT_IPC.tagDelete, req),
    cherryPick: (req) => ipcRenderer.invoke(GIT_IPC.cherryPick, req),
    revert: (req) => ipcRenderer.invoke(GIT_IPC.revert, req),
    reset: (req) => ipcRenderer.invoke(GIT_IPC.reset, req),
    init: (req) => ipcRenderer.invoke(GIT_IPC.init, req),
    authDetect: () => ipcRenderer.invoke(GIT_IPC.authDetect),
    authLoginGh: (req) => ipcRenderer.invoke(GIT_IPC.authLoginGh, req),
    authLogoutGh: (req) => ipcRenderer.invoke(GIT_IPC.authLogoutGh, req),
    authLoginHttps: (req) => ipcRenderer.invoke(GIT_IPC.authLoginHttps, req),
    authValidate: (req) => ipcRenderer.invoke(GIT_IPC.authValidate, req),
    sshProbe: (req) => ipcRenderer.invoke(GIT_IPC.sshProbe, req),
    ghPrList: (req) => ipcRenderer.invoke(GIT_IPC.ghPrList, req),
    ghPrView: (req) => ipcRenderer.invoke(GIT_IPC.ghPrView, req),
    ghPrCreate: (req) => ipcRenderer.invoke(GIT_IPC.ghPrCreate, req),
    ghPrMerge: (req) => ipcRenderer.invoke(GIT_IPC.ghPrMerge, req)
  } satisfies GitApi,
  account: {
    requestCode: (req) => ipcRenderer.invoke(ACCOUNT_IPC.requestCode, req),
    verifyCode: (req) => ipcRenderer.invoke(ACCOUNT_IPC.verifyCode, req),
    current: (accountId: string) => ipcRenderer.invoke(ACCOUNT_IPC.current, accountId),
    update: (accountId: string, req) => ipcRenderer.invoke(ACCOUNT_IPC.update, accountId, req),
    listAccounts: () => ipcRenderer.invoke(ACCOUNT_IPC.listAccounts),
    setDefault: (accountId: string) => ipcRenderer.invoke(ACCOUNT_IPC.setDefault, accountId),
    removeAccount: (accountId: string) => ipcRenderer.invoke(ACCOUNT_IPC.removeAccount, accountId)
  },
  social: {
    watch: (accountId: string) => ipcRenderer.invoke(SOCIAL_IPC.watch, accountId),
    listFriends: (accountId: string) => ipcRenderer.invoke(SOCIAL_IPC.listFriends, accountId),
    searchUsers: (accountId: string, query: string) =>
      ipcRenderer.invoke(SOCIAL_IPC.searchUsers, accountId, query),
    listRequests: (accountId: string) => ipcRenderer.invoke(SOCIAL_IPC.listRequests, accountId),
    sendRequest: (accountId: string, targetId: string) =>
      ipcRenderer.invoke(SOCIAL_IPC.sendRequest, accountId, targetId),
    respondRequest: (accountId: string, requestId: string, accept: boolean) =>
      ipcRenderer.invoke(SOCIAL_IPC.respondRequest, accountId, requestId, accept),
    removeFriend: (accountId: string, otherId: string) =>
      ipcRenderer.invoke(SOCIAL_IPC.removeFriend, accountId, otherId),
    listMessages: (accountId: string, withUserId: string, beforeId?: string | null, limit?: number) =>
      ipcRenderer.invoke(SOCIAL_IPC.listMessages, accountId, withUserId, beforeId ?? null, limit ?? 50),
    sendMessage: (
      accountId: string,
      toUserId: string,
      body: string,
      replyTo?: string | null,
      attachments?: ImageUpload[]
    ) =>
      ipcRenderer.invoke(
        SOCIAL_IPC.sendMessage,
        accountId,
        toUserId,
        body,
        replyTo ?? null,
        attachments ?? []
      ),
    uploadImage: (accountId: string, kind: 'chat' | 'avatar', image: ImageUpload) =>
      ipcRenderer.invoke(SOCIAL_IPC.uploadImage, accountId, kind, image),
    editMessage: (accountId: string, messageId: string, body: string) =>
      ipcRenderer.invoke(SOCIAL_IPC.editMessage, accountId, messageId, body),
    deleteMessage: (accountId: string, messageId: string) =>
      ipcRenderer.invoke(SOCIAL_IPC.deleteMessage, accountId, messageId),
    markRead: (accountId: string, withUserId: string) =>
      ipcRenderer.invoke(SOCIAL_IPC.markRead, accountId, withUserId),
    getPresence: (accountId: string) => ipcRenderer.invoke(SOCIAL_IPC.getPresence, accountId),
    setPresence: (accountId: string, status: PresenceStatus, activity: PresenceActivity) =>
      ipcRenderer.invoke(SOCIAL_IPC.setPresence, accountId, status, activity),
    sendTyping: (accountId: string, peerId: string, typing: boolean) =>
      ipcRenderer.invoke(SOCIAL_IPC.sendTyping, accountId, peerId, typing),
    onPresenceChanged: (callback: (event: AccountEvent) => void) => {
      const listener = (_event: IpcRendererEvent, payload: AccountEvent): void => callback(payload)
      ipcRenderer.on(SOCIAL_IPC.presenceChanged, listener)
      return () => {
        ipcRenderer.removeListener(SOCIAL_IPC.presenceChanged, listener)
      }
    },
    onIncomingMessage: (callback: (event: IncomingMessageEvent) => void) => {
      const listener = (_event: IpcRendererEvent, payload: IncomingMessageEvent): void =>
        callback(payload)
      ipcRenderer.on(SOCIAL_IPC.incomingMessage, listener)
      return () => {
        ipcRenderer.removeListener(SOCIAL_IPC.incomingMessage, listener)
      }
    },
    onMessageUpdated: (callback: (event: MessageUpdateEvent) => void) => {
      const listener = (_event: IpcRendererEvent, payload: MessageUpdateEvent): void => callback(payload)
      ipcRenderer.on(SOCIAL_IPC.messageUpdated, listener)
      return () => {
        ipcRenderer.removeListener(SOCIAL_IPC.messageUpdated, listener)
      }
    },
    onMessageDeleted: (callback: (event: MessageDeleteEvent) => void) => {
      const listener = (_event: IpcRendererEvent, payload: MessageDeleteEvent): void => callback(payload)
      ipcRenderer.on(SOCIAL_IPC.messageDeleted, listener)
      return () => {
        ipcRenderer.removeListener(SOCIAL_IPC.messageDeleted, listener)
      }
    },
    onRequestsChanged: (callback: (event: AccountEvent) => void) => {
      const listener = (_event: IpcRendererEvent, payload: AccountEvent): void => callback(payload)
      ipcRenderer.on(SOCIAL_IPC.requestsChanged, listener)
      return () => {
        ipcRenderer.removeListener(SOCIAL_IPC.requestsChanged, listener)
      }
    },
    onFriendsChanged: (callback: (event: AccountEvent) => void) => {
      const listener = (_event: IpcRendererEvent, payload: AccountEvent): void => callback(payload)
      ipcRenderer.on(SOCIAL_IPC.friendsChanged, listener)
      return () => {
        ipcRenderer.removeListener(SOCIAL_IPC.friendsChanged, listener)
      }
    },
    onTypingChanged: (callback: (event: TypingEvent) => void) => {
      const listener = (_event: IpcRendererEvent, payload: TypingEvent): void => callback(payload)
      ipcRenderer.on(SOCIAL_IPC.typingChanged, listener)
      return () => {
        ipcRenderer.removeListener(SOCIAL_IPC.typingChanged, listener)
      }
    }
  },
  scrakk: {
    roots: (projectRoot?: string | null) =>
      ipcRenderer.invoke(SCRAKK_FS_IPC.roots, projectRoot ?? null),
    list: (op: ScrakkOp) => ipcRenderer.invoke(SCRAKK_FS_IPC.list, op),
    read: (op: ScrakkOp) => ipcRenderer.invoke(SCRAKK_FS_IPC.read, op),
    write: (op: ScrakkWriteOp) => ipcRenderer.invoke(SCRAKK_FS_IPC.write, op),
    delete: (op: ScrakkOp) => ipcRenderer.invoke(SCRAKK_FS_IPC.delete, op),
    mkdir: (op: ScrakkOp) => ipcRenderer.invoke(SCRAKK_FS_IPC.mkdir, op),
    exists: (op: ScrakkOp) => ipcRenderer.invoke(SCRAKK_FS_IPC.exists, op),
    stat: (op: ScrakkOp) => ipcRenderer.invoke(SCRAKK_FS_IPC.stat, op),
    readJson: (op: ScrakkOp) => ipcRenderer.invoke(SCRAKK_FS_IPC.readJson, op),
    writeJson: (op: ScrakkWriteJsonOp) => ipcRenderer.invoke(SCRAKK_FS_IPC.writeJson, op),
    watch: (op: ScrakkOp) => ipcRenderer.invoke(SCRAKK_FS_IPC.watch, op),
    unwatch: (op: ScrakkOp) => ipcRenderer.invoke(SCRAKK_FS_IPC.unwatch, op),
    onChanged: (callback: (event: ScrakkChangeEvent) => void) => {
      const listener = (_event: IpcRendererEvent, payload: ScrakkChangeEvent): void => callback(payload)
      ipcRenderer.on(SCRAKK_FS_IPC.changed, listener)
      return () => {
        ipcRenderer.removeListener(SCRAKK_FS_IPC.changed, listener)
      }
    }
  },
  modelsDev: {
    catalog: () => ipcRenderer.invoke(MODELS_DEV_IPC.catalog) as Promise<ModelsDevCatalog | null>,
    refresh: () => ipcRenderer.invoke(MODELS_DEV_IPC.refresh) as Promise<ModelsDevCatalog | null>
  },
  web: {
    search: (request: WebSearchRequest) => ipcRenderer.invoke(WEB_IPC.search, request),
    fetch: (request: WebFetchRequest) => ipcRenderer.invoke(WEB_IPC.fetch, request)
  }
}

contextBridge.exposeInMainWorld('api', api)
