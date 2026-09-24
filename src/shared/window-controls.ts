// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Módulo compartido (main + preload + renderer).
 *
 * Un único lugar define los canales IPC y la forma de la API de ventana.
 * Así el contrato no puede desincronizarse entre procesos.
 */
import type { LlmApi } from './llm'
import type { FsApi } from './fs'
import type { ExtensionsApi } from './extensions'
import type { LspApi } from './lsp'
import type { UpdatesApi } from './updates'
import type { AccountApi } from './account'
import type { SocialApi } from './social'

export const WINDOW_CONTROLS_IPC = {
  minimize: 'window-controls:minimize',
  toggleMaximize: 'window-controls:toggle-maximize',
  close: 'window-controls:close',
  isMaximized: 'window-controls:is-maximized',
  maximizedChanged: 'window-controls:maximized-changed',
  setTitleBarOverlay: 'window-controls:set-titlebar-overlay'
} as const

/** Estilo del overlay donde el OS dibuja los botones nativos (min/max/close). */
export interface TitleBarOverlayOptions {
  color?: string
  symbolColor?: string
  height?: number
}

/**
 * API expuesta por el preload para controlar la ventana.
 * Los botones nativos (min/max/close) los dibuja el OS vía `titleBarOverlay`
 * (soportado en Windows y Linux con GTK en Electron 43+); esta API queda para
 * acciones programáticas y para sincronizar el color del overlay con el tema.
 */
export interface WindowControlsApi {
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  /** Suscribirse a cambios de maximizado. Devuelve unsubscriber. */
  onMaximizedChange: (callback: (maximized: boolean) => void) => () => void
  /** Actualiza el color del overlay de botones nativos (match con el tema). */
  setTitleBarOverlay: (options: TitleBarOverlayOptions) => void
}

/** API de codificaciones expuesta al renderer. */
export interface EncodingsApi {
  readEncoded: (path: string) => Promise<
    import('./encodings').ReadEncodedResponse
  >
  writeEncoded: (request: import('./encodings').WriteEncodedRequest) => Promise<
    import('./encodings').WriteEncodedResult
  >
  list: () => Promise<import('./encodings').ListEncodingsResponse>
  registerDynamic: (
    extensionId: string,
    codecs: import('./encodings').DynamicCodecPayload['codecs']
  ) => Promise<import('./encodings').RegisterDynamicCodecsResponse>
  removeDynamic: (extensionId: string) => Promise<{ success: boolean; removed?: string[] }>
}

/** API global que el preload expone en `window.api`. */
export interface WindowApi {
  windowControls: WindowControlsApi
  /** Capturas de pantalla (las hace el main: el canvas es WebGL). */
  screenshot: import('./screenshot').ScreenshotApi
  /** Chat LLM por IPC: el fetch corre en el proceso main (sin CORS). */
  llm: LlmApi
  /** Filesystem: operaciones de archivo, proceso y búsqueda vía IPC. */
  fs: FsApi
  /** Extensiones SEF: instalar/desinstalar/listar `.sef` en userData. */
  extensions: ExtensionsApi
  /** LSP: servers, requests y diagnósticos (runtime en el proceso main). */
  lsp: LspApi
  /** Actualizaciones del IDE vía GitHub Releases. */
  updates: UpdatesApi
  /** Codificaciones: leer/escribir con encoding + registro de codecs de extensiones. */
  encodings: EncodingsApi
  /** Terminal PTY: creado por la extensión innerta-bridge, renderizado por Innerta view. */
  terminal: import('./terminal').TerminalApi
  /** Git real: comandos capados en main, parsers compartidos. */
  git: import('./git').GitApi
  /** Cuenta Scrakk (login compartido con el CLI): email+password vía IPC. */
  account: AccountApi
  /** Social real: amigos + mensajes directos con Realtime. */
  social: SocialApi
  /** API global de la carpeta `.scrakk` (user/project): CRUD + watch. */
  scrakk: import('./scrakk').ScrakkFsApi
  /** Catálogo de modelos (models.dev): proveedores + modelos, con logos. */
  modelsDev: import('./modelsDev').ModelsDevApi
  /** Búsqueda y fetch web (main, sin CORS, con protección SSRF). */
  web: import('./web').WebApi
}
