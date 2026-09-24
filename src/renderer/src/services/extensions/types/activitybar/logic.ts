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

export function buildActivityBarButton(
  contribution: ActivityBarContribution,
  resolver: ComponentResolver
): ActivityBarButton {
  return {
    id: contribution.id,
    label: contribution.label,
    icon: resolver.resolveIcon(contribution.icon) ?? contribution.icon,
    side: contribution.side,
    target: contribution.target,
    panelId: contribution.panelId,
    order: contribution.order
  }
}
