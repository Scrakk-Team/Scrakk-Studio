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

/** API global que el preload expone en `window.api`. */
export interface WindowApi {
  windowControls: WindowControlsApi
  /** Chat LLM por IPC: el fetch corre en el proceso main (sin CORS). */
  llm: LlmApi
  /** Filesystem: operaciones de archivo, proceso y búsqueda vía IPC. */
  fs: FsApi
  /** Extensiones SEF: instalar/desinstalar/listar `.sef` en userData. */
  extensions: ExtensionsApi
  /** LSP: servers, requests y diagnósticos (runtime en el proceso main). */
  lsp: LspApi
}
