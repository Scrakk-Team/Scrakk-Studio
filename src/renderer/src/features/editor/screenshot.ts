/**
 * Captura del editor Innerta (PNG en disco).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ SE CAPTURA LA PANTALLA Y NO EL CANVAS
 *
 * El canvas del editor es WebGL. `canvas.toDataURL()` sale vacío (el buffer ya
 * se compuso) y `getContext('2d')` devuelve `null`, así que el renderer no puede
 * leer sus píxeles. La captura la hace el main sobre la página compuesta: son
 * exactamente los píxeles que ve el usuario, con el tema, el resaltado y el
 * cursor incluidos.
 *
 * Sirve para compartir un bug de color o de layout sin describirlo, y es la
 * misma vía que usan los probes para verificar que el editor PINTA (en vez de
 * inferirlo por heurísticas).
 */

import { notify } from '@services/notifications'
import type { ScreenshotResponse } from '@shared/screenshot'

/** Selector del canvas de Innerta (el mismo que usa el engine para el foco). */
const CANVAS_SELECTOR = '.scrakk-innerta-canvas'

/** Rect del canvas en px CSS, o `undefined` si no hay editor montado. */
function editorRect(): { x: number; y: number; width: number; height: number } | undefined {
  const canvas = document.querySelector(CANVAS_SELECTOR)
  if (!(canvas instanceof HTMLElement)) return undefined
  const rect = canvas.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return undefined
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

/**
 * Toma la captura del editor (o de la ventana si no hay editor montado).
 * Devuelve la respuesta del main tal cual: quien llama decide si avisa o no.
 */
export async function captureEditorScreenshot(
  options: { silent?: boolean } = {}
): Promise<ScreenshotResponse> {
  const api = window.api?.screenshot
  if (!api) return { success: false, error: 'el puente de capturas no está disponible' }

  const response = await api.capture({ rect: editorRect() })
  if (options.silent) return response

  if (response.success && response.path) {
    notify({
      title: 'Captura del editor guardada',
      message: response.path,
      detail: response.width ? `${response.width}×${response.height} px` : undefined,
      severity: 'success',
      actions: [
        {
          label: 'Mostrar en carpeta',
          run: () => {
            void window.api?.fs?.openInFolder(response.path ?? '')
          }
        }
      ]
    })
  } else {
    notify({
      title: 'No se pudo capturar el editor',
      message: response.error ?? 'error desconocido',
      severity: 'error'
    })
  }
  return response
}
