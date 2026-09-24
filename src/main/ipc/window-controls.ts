// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import {
  BrowserWindow,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import {
  WINDOW_CONTROLS_IPC,
  type TitleBarOverlayOptions
} from '@shared/window-controls'

function windowFromEvent(
  event: IpcMainEvent | IpcMainInvokeEvent
): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

/**
 * Módulo IPC de control de ventana.
 * Los botones nativos los dibuja el OS (titleBarOverlay); esto queda para
 * acciones programáticas y para el color del overlay según el tema.
 */
export function registerWindowControlsIpc(): void {
  ipcMain.on(WINDOW_CONTROLS_IPC.minimize, (event) => {
    windowFromEvent(event)?.minimize()
  })

  ipcMain.on(WINDOW_CONTROLS_IPC.toggleMaximize, (event) => {
    const win = windowFromEvent(event)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on(WINDOW_CONTROLS_IPC.close, (event) => {
    windowFromEvent(event)?.close()
  })

  ipcMain.handle(WINDOW_CONTROLS_IPC.isMaximized, (event) => {
    return windowFromEvent(event)?.isMaximized() ?? false
  })

  ipcMain.on(WINDOW_CONTROLS_IPC.setTitleBarOverlay, (event, options: TitleBarOverlayOptions) => {
    const win = windowFromEvent(event)
    if (!win) return
    try {
      win.setTitleBarOverlay(options)
    } catch {
      // Plataforma sin Window Controls Overlay: no-op silencioso.
    }
  })
}
