// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Capturas de pantalla — contrato compartido (main + preload + renderer).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 *
 * El canvas de Innerta es **WebGL**: desde el renderer no se pueden leer sus
 * píxeles (`getContext('2d')` devuelve `null` y `toDataURL()` sale en blanco si
 * el buffer ya se compuso). Eso dejaba sin verificación todo lo que el editor
 * PINTA: se podía comprobar que los tokens llegaban al motor, pero no que el
 * usuario los viera.
 *
 * La captura la hace el MAIN (`webContents.capturePage()`), que devuelve los
 * píxeles YA compuestos — exactamente lo que ve el usuario — y los escribe en
 * disco. El renderer sólo dice QUÉ zona quiere y dónde guardarla.
 *
 * Sirve para las dos cosas: el usuario puede capturar su editor, y los probes
 * pueden mirar el resultado en vez de adivinar por heurísticas.
 */

export const SCREENSHOT_IPC = {
  capture: 'screenshot:capture'
} as const

/**
 * Zona a capturar, en píxeles CSS de la ventana (los de `getBoundingClientRect`).
 *
 * Sin rect se captura la ventana entera. El main recorta con la escala real del
 * display, así que funciona igual en HiDPI que en un monitor normal.
 */
export interface ScreenshotRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenshotRequest {
  /** Zona a capturar (por defecto: toda la ventana). */
  rect?: ScreenshotRect
  /** Directorio destino (por defecto: la carpeta de descargas del usuario). */
  dir?: string
  /** Nombre del archivo, sin extensión (por defecto `innerta-<fecha>.png`). */
  name?: string
}

export interface ScreenshotResponse {
  success: boolean
  /** Ruta absoluta del PNG escrito. */
  path?: string
  /** Tamaño real de la imagen guardada (px). */
  width?: number
  height?: number
  error?: string
}

/** API expuesta por el preload. */
export interface ScreenshotApi {
  capture: (request?: ScreenshotRequest) => Promise<ScreenshotResponse>
}
