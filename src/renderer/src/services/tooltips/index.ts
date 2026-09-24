// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tooltips globales — API pública.
 *
 * Un solo tooltip con estilo del tema para TODO el IDE (editor Innerta,
 * statusbar, paneles) y expuesto a extensiones vía ctx.api.tooltips.
 */

import { TooltipHost, hideGlobalTooltip, showGlobalTooltip } from './TooltipHost'
import type { TooltipRequest } from './TooltipHost'

export { TooltipHost }
export type { TooltipRequest }

/** Muestra un tooltip del tema en coords de pantalla. */
export function showTooltip(request: TooltipRequest): void {
  showGlobalTooltip(request)
}

export function hideTooltip(): void {
  hideGlobalTooltip()
}
