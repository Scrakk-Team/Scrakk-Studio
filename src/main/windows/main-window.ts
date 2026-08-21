import { join } from 'node:path'
import { BrowserWindow, nativeImage, shell } from 'electron'
import { WINDOW_CONTROLS_IPC } from '@shared/window-controls'

/** Debe coincidir con --titlebar-height en core/theme/tokens.css. */
const TITLEBAR_HEIGHT = 38

/**
 * Ventana principal.
 *
 * `titleBarStyle: 'hidden'` + `titleBarOverlay` → el OS dibuja los botones
 * nativos de ventana (min/max/close) sobre nuestra titlebar custom.
 * Aunque la doc web dice Windows/macOS, Electron 43+ lo soporta en Linux con
 * GTK (`setTitleBarOverlay` tiene @platform win32,linux) — como Rutinas.
 */
export function createMainWindow(): BrowserWindow {
  const isDev = !!process.env['ELECTRON_RENDERER_URL']

  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    show: false,
    backgroundColor: '#000000',
    title: 'Scrakk Studio',
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
      sandbox: true
    }
  })

  // Notificar al renderer los cambios de maximizado (ícono max/restore).
  const notifyMaximized = (): void => {
    if (!window.isDestroyed()) {
      window.webContents.send(WINDOW_CONTROLS_IPC.maximizedChanged, window.isMaximized())
    }
  }
  window.on('maximize', notifyMaximized)
  window.on('unmaximize', notifyMaximized)

  // En dev, aplicar ícono de app para que se vea en la taskbar de Linux.
  if (isDev) {
    const iconPath = join(__dirname, '../../assets/scrakk-studio-b.png')
    const icon = nativeImage.createFromPath(iconPath)
    if (!icon.isEmpty()) window.setIcon(icon)
  }

  window.on('ready-to-show', () => window.show())

  // Links externos → navegador del sistema, nunca dentro de la app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
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
