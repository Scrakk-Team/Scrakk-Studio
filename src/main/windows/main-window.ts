// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { app, BrowserWindow, shell } from 'electron'
import { WINDOW_CONTROLS_IPC } from '@shared/window-controls'

import { t } from '@shared/i18n'
/** Debe coincidir con --titlebar-height en core/theme/tokens.css. */
const TITLEBAR_HEIGHT = 38

/** Hosts loopback: `localhost` y sus equivalentes por IP. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** URL del dev server (dev). null en prod. */
const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  ? new URL(process.env['ELECTRON_RENDERER_URL'])
  : null

/**
 * True si la URL pertenece al propio dev server (local). Estas navegaciones
 * NUNCA van al navegador externo: son las que usa Vite HMR para recargar la
 * ventana en el lugar (sin esto, cada hot reload abría una tab de browser
 * con localhost y la ventana quedaba congelada).
 *
 * Compara protocolo + puerto y acepta cualquier host loopback, porque
 * `localhost`, `127.0.0.1` y `[::1]` apuntan al mismo dev server: un
 * `location.reload()` puede resolver a cualquiera de ellos.
 */
export function isAppLocalUrl(url: string): boolean {
  if (!devServerUrl) return false
  try {
    const target = new URL(url)
    return (
      target.protocol === devServerUrl.protocol &&
      target.port === devServerUrl.port &&
      LOOPBACK_HOSTS.has(target.hostname) &&
      LOOPBACK_HOSTS.has(devServerUrl.hostname)
    )
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
    title: t('main.scrakk.studio'),
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

  // El zoom de PÁGINA de Chromium (Ctrl/⌘ + rueda) se guarda POR ORIGEN en el
  // perfil (`partition.per_host_zoom_levels`), así que un accidente sobrevive al
  // reinicio y deja el IDE entero enano, sin forma de volver desde la UI. Se
  // resetea al crear la ventana; además el renderer lo bloquea (initZoomGuard).
  window.webContents.setZoomFactor(1)
  // …y OTRA VEZ al terminar de cargar: el nivel guardado por origen se aplica
  // al navegar, así que el del constructor no alcanza (la ventana se crea antes
  // de que exista el host del zoom).
  window.webContents.on('did-finish-load', () => {
    if (!window.isDestroyed()) window.webContents.setZoomFactor(1)
  })

  // El zoom de PÁGINA nunca más:
  //  - pinch-zoom (trackpad) limitado a 1:1;
  //  - `zoom-changed` (Ctrl+rueda) se cancela en el origen — el renderer lo
  //    frena, pero el gesto del trackpad no siempre llega al DOM;
  //  - cualquier intención de zoom vuelve a 1.
  // Los zooms PROPIOS (canvas del editor, terminal, visor de nodos) no pasan
  // por acá: los maneja el motor con su propia rueda/teclas.
  window.webContents.setVisualZoomLevelLimits(1, 1)
  window.webContents.on('zoom-changed', (event) => {
    event.preventDefault()
    if (!window.isDestroyed()) window.webContents.setZoomFactor(1)
  })
  window.webContents.on('did-finish-load', () => {
    if (!window.isDestroyed()) window.webContents.setZoomFactor(1)
  })

  // `Menu.setApplicationMenu(null)` (ver main/index.ts) se llevó también los
  // aceleradores que traía el menú POR DEFECTO de Electron: Recargar
  // (Ctrl+R / F5), Recargar sin caché (Ctrl+Shift+R), DevTools (Ctrl+Shift+I /
  // F12) y Pantalla completa (F11). Se reponen acá — sin los roles de zoom,
  // que eran el motivo de quitar el menú — para que el flujo de desarrollo
  // siga funcionando sin volver a habilitar el zoom de página.
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = input.key.toLowerCase()
    // Ctrl+Alt+… es el espacio de atajos de la app: no se toca.
    const primary = input.control && !input.alt

    // DevTools: se abren en dev y se bloquean en el build entregado (además
    // del `devTools: false` de webPreferences).
    if (key === 'f12' || (primary && input.shift && (key === 'i' || key === 'j' || key === 'c'))) {
      event.preventDefault()
      if (!app.isPackaged && !window.isDestroyed()) window.webContents.toggleDevTools()
      return
    }

    // Recargar (Ctrl+R / F5) y sin caché (Ctrl+Shift+R / Shift+F5).
    if ((primary && key === 'r') || key === 'f5') {
      event.preventDefault()
      if (window.isDestroyed()) return
      if (input.shift) window.webContents.reloadIgnoringCache()
      else window.webContents.reload()
      return
    }

    if (key === 'f11' && !primary) {
      event.preventDefault()
      if (!window.isDestroyed()) window.setFullScreen(!window.isFullScreen())
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

  // Mostrar la ventana de forma robusta. En Wayland `ready-to-show` es
  // inconsistente desde Electron 38 (electron#48859): puede no dispararse y la
  // ventana nunca se muestra (aparece en la barra pero no abre). Se compite
  // contra `did-finish-load` y un timeout de seguridad.
  let shown = false
  const showOnce = (): void => {
    if (shown || window.isDestroyed()) return
    shown = true
    window.show()
  }
  window.on('ready-to-show', showOnce)
  window.webContents.on('did-finish-load', showOnce)
  const showFallback = setTimeout(showOnce, 2500)
  showFallback.unref?.()
  window.on('closed', () => clearTimeout(showFallback))

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
