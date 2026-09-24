// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Registry de botones de la activity bar.
 *
 * Cualquier folder `buttons/<id>/index.ts` cuyo default export sea un
 * `ActivityBarButton` se registra solo — sin tocar nada más.
 *
 * Nota: el panel central (welcome) NO tiene botón manual — nunca se
 * desactiva salvo que una condición lo requiera. La funcionalidad de
 * montar/desmontarlo sigue disponible programáticamente vía
 * `useLayout().toggleSlotPanel('center', 'welcome')`; solo no se expone
 * un botón para hacerlo a mano.
 */

import { ExtensionRegistry } from '@services/extensions'
import type { ActivityBarButton, ActivityBarSide } from './types'

const modules = import.meta.glob<{ default: ActivityBarButton }>('./buttons/*/index.ts', {
  eager: true
})

export const activityBarButtons: ActivityBarButton[] = Object.values(modules)
  .map((module) => module.default)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

/**
 * Botones de una barra lateral: los built-in (registry estático) fusionados
 * con los que aportan las extensiones en runtime (ExtensionRegistry).
 */
export function getButtonsForSide(side: ActivityBarSide): ActivityBarButton[] {
  const builtin = activityBarButtons.filter((button) => button.side === side)
  const extension = ExtensionRegistry.getActivityButtons().filter((button) => button.side === side)
  return [...builtin, ...extension].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}
