// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'activityBar' — lógica de registro.
 * Construye el ActivityBarButton que consume la activity bar de la app.
 */

import type { ActivityBarButton } from '@features/activitybar'
import type { ComponentResolver } from '../../manifest'
import type { ActivityBarContribution } from './schema'
import { sanitizeSvgIcon } from '../../svgIcon'

export function buildActivityBarButton(
  contribution: ActivityBarContribution,
  resolver: ComponentResolver
): ActivityBarButton {
  const resolved = resolver.resolveIcon(contribution.icon) ?? contribution.icon
  // El icono puede venir de un archivo del paquete (SVG inline): se sanea
  // antes de llegar al `dangerouslySetInnerHTML` del botón.
  const icon =
    typeof resolved === 'string' && resolved.trimStart().startsWith('<svg')
      ? sanitizeSvgIcon(resolved) ?? ''
      : resolved
  return {
    id: contribution.id,
    label: contribution.label,
    icon,
    side: contribution.side,
    target: contribution.target,
    panelId: contribution.panelId,
    order: contribution.order
  }
}
