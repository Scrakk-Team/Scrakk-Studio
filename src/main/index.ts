import { app, BrowserWindow, shell } from 'electron'
import { registerLlmIpc } from './ipc/llm'
import { registerFsIpc } from './ipc/fs'
import { registerWindowControlsIpc } from './ipc/window-controls'
import { registerExtensionsIpc } from './ipc/extensions'
import { registerLspIpc } from './lsp'
import { createMainWindow } from './windows/main-window'

// Instancia única: si ya hay una app corriendo, se enfoca su ventana.
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const main = BrowserWindow.getAllWindows()[0]
    if (main) {
      if (main.isMinimized()) main.restore()
      main.focus()
    }
  })

  app.whenReady().then(() => {
    registerWindowControlsIpc()
    registerLlmIpc()
    registerFsIpc()
    registerExtensionsIpc()
    registerLspIpc()

    // Links externos (target=_blank) se abren en el navegador del sistema,
    // nunca en una ventana nueva de Electron.
    app.on('web-contents-created', (_event, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          void shell.openExternal(url)
        }
        return { action: 'deny' }
      })
      // La ventana de la app jamás navega a una web externa (defensa extra
      // para links sin target=_blank o redirects): se abre afuera.
      contents.on('will-navigate', (event, url) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          event.preventDefault()
          void shell.openExternal(url)
        }
      })
    })

    createMainWindow()

    // macOS: re-crear la ventana al activar el dock si no hay ninguna.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
