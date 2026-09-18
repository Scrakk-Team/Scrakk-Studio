/**
 * Capturas de pantalla (proceso main).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ACÁ Y NO EN EL RENDERER
 *
 * El canvas del editor es WebGL: leer sus píxeles desde el renderer no funciona
 * (con `preserveDrawingBuffer: false`, `toDataURL()` devuelve una imagen vacía
 * una vez compuesto el frame, y `getContext('2d')` ni siquiera existe). El main
 * captura la página YA COMPUESTA con `webContents.capturePage()`, así que la
 * imagen es exactamente lo que ve el usuario, con los mismos píxeles.
 *
 * Escribe el PNG y devuelve la ruta: así el renderer puede avisar dónde quedó y
 * un probe puede abrirlo para verificar el render sin heurísticas.
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  SCREENSHOT_IPC,
  type ScreenshotRequest,
  type ScreenshotResponse
} from '@shared/screenshot'

/** `innerta-20260917-153012` — ordenable y sin caracteres raros para un archivo. */
function defaultName(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `innerta-${stamp}`
}

export function registerScreenshotIpc(): void {
  ipcMain.handle(
    SCREENSHOT_IPC.capture,
    async (event, request: ScreenshotRequest = {}): Promise<ScreenshotResponse> => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return { success: false, error: 'no hay ventana para capturar' }

        let image = await win.webContents.capturePage()
        if (image.isEmpty()) return { success: false, error: 'la captura salió vacía' }

        // El rect llega en px CSS (los de `getBoundingClientRect`). Si el
        // display tiene escala > 1, la imagen capturada tiene más píxeles: se
        // escala el rect para recortar la zona REAL y no un pedazo corrido.
        if (request.rect) {
          const size = image.getSize()
          const contentSize = win.getContentSize()
          const scaleX = contentSize[0] > 0 ? size.width / contentSize[0] : 1
          const scaleY = contentSize[1] > 0 ? size.height / contentSize[1] : 1
          const rect = {
            x: Math.max(0, Math.round(request.rect.x * scaleX)),
            y: Math.max(0, Math.round(request.rect.y * scaleY)),
            width: Math.round(request.rect.width * scaleX),
            height: Math.round(request.rect.height * scaleY)
          }
          const bounded = {
            x: Math.min(rect.x, Math.max(0, size.width - 1)),
            y: Math.min(rect.y, Math.max(0, size.height - 1)),
            width: Math.max(1, Math.min(rect.width, size.width - rect.x)),
            height: Math.max(1, Math.min(rect.height, size.height - rect.y))
          }
          image = image.crop(bounded)
        }

        const dir = request.dir ?? app.getPath('downloads')
        await fs.mkdir(dir, { recursive: true })
        const filePath = path.join(dir, `${request.name ?? defaultName()}.png`)
        const png = image.toPNG()
        if (png.length === 0) return { success: false, error: 'no se pudo codificar el PNG' }
        await fs.writeFile(filePath, png)

        const finalSize = image.getSize()
        return {
          success: true,
          path: filePath,
          width: finalSize.width,
          height: finalSize.height
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )
}
