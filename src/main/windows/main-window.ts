// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { app, BrowserWindow, shell } from 'electron'
import { WINDOW_CONTROLS_IPC } from '@shared/window-controls'

/** Debe coincidir con --titlebar-height en core/theme/tokens.css. */
const TITLEBAR_HEIGHT = 38

/** Origen del dev server (dev). null en prod. */
const devOrigin = process.env['ELECTRON_RENDERER_URL']
  ? new URL(process.env['ELECTRON_RENDERER_URL']).origin
  : null

/**
 * True si la URL es la del propio dev server (local). Estas navegaciones
 * NUNCA van al navegador externo: son las que usa Vite HMR para recargar la
 * ventana en el lugar (sin esto, cada hot reload abría una tab de browser
 * con localhost y la ventana quedaba congelada).
 */
export function isAppLocalUrl(url: string): boolean {
  if (!devOrigin) return false
  try {
    return new URL(url).origin === devOrigin
  } catch {
    return false
  }
}

/**
 * Ruta del icono de app: en dev vive en assets/ del repo; empaquetada,
 * en resources. undefined si no existe (BrowserWindow lo acepta).
 */
function getAppIcon(): string | undefined {
  const devPath = join(__dirname, '../../assets/scrakk-studio-b.png')
  if (existsSync(devPath)) return devPath
  const prodPath = join(process.resourcesPath, 'assets/scrakk-studio-b.png')
  if (existsSync(prodPath)) return prodPath
  return undefined
}

/**
 * Ventana principal.
 *
 * `titleBarStyle: 'hidden'` + `titleBarOverlay` → el OS dibuja los botones
 * nativos de ventana (min/max/close) sobre nuestra titlebar custom.
 * Aunque la doc web dice Windows/macOS, Electron 43+ lo soporta en Linux con
 * GTK (`setTitleBarOverlay` tiene @platform win32,linux) — como Rutinas.
 */
export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    show: false,
    backgroundColor: '#000000',
    title: 'Scrakk Studio',
    icon: getAppIcon(),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#101010',
      symbolColor: '#b8b8b8',
      height: TITLEBAR_HEIGHT
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // En un build ENTREGADO no se abren DevTools (evita copiar el front a
      // mano). En dev sí, para trabajar.
      devTools: !app.isPackaged
    }
  })

  // Bloqueo extra de atajos de DevTools en el build entregado (F12,
  // Ctrl/Cmd+Shift+I/J/C). Además del devTools:false de arriba.
  if (app.isPackaged) {
    window.webContents.on('before-input-event', (event, input) => {
      const key = input.key.toLowerCase()
      const combo = input.control || input.meta
      if (key === 'f12' || (combo && input.shift && (key === 'i' || key === 'j' || key === 'c'))) {
        event.preventDefault()
      }
    })
  }

  // Notificar al renderer los cambios de maximizado (ícono max/restore).
  const notifyMaximized = (): void => {
    if (!window.isDestroyed()) {
      window.webContents.send(WINDOW_CONTROLS_IPC.maximizedChanged, window.isMaximized())
    }
  }
  window.on('maximize', notifyMaximized)
  window.on('unmaximize', notifyMaximized)

  window.on('ready-to-show', () => window.show())

  // Links externos → navegador del sistema, nunca dentro de la app. El propio
  // dev server (HMR) jamás se abre afuera.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppLocalUrl(url) && (url.startsWith('http://') || url.startsWith('https://'))) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    // Dev: hot reload desde el dev server de Vite.
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
