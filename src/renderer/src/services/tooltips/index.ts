// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tooltips globales — API pública.
 *
 * Un solo tooltip con estilo del tema para TODO el IDE (editor Innerta,
 * statusbar, paneles) y expuesto a extensiones vía ctx.api.tooltips.
 */

import { TooltipHost, hideGlobalTooltip, hideGlobalTooltipForce, showGlobalTooltip } from './TooltipHost'
import type { TooltipRequest } from './TooltipHost'

export { TooltipHost }
export type { TooltipRequest }

/** Muestra un tooltip del tema en coords de pantalla. */
export function showTooltip(request: TooltipRequest): void {
  showGlobalTooltip(request)
}

/**
 * Oculta el tooltip. Si el puntero está ENCIMA de él, NO se oculta: se queda
 * quieto para que puedas leerlo (o copiar texto de un hover de LSP).
 */
export function hideTooltip(): void {
  hideGlobalTooltip()
}

/** Oculta el tooltip aunque el puntero esté encima (scroll, click). */
export function hideTooltipForce(): void {
  hideGlobalTooltipForce()
}
