// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'centerTabs' — lógica de registro.
 *
 * El contenido del tab también se registra como panel: así el PanelHost del
 * slot central lo monta con su ErrorBoundary, igual que cualquier otro panel.
 * El id del tab ES el id del panel.
 *
 * Se registra con `load` (import dinámico), NO con `React.lazy`: el PanelHost
 * no tiene Suspense y un `lazy` sin boundary no monta cuando el módulo llega
 * (el panel recién aparece al volver a abrirlo). Ver `panelComponentLoader`
 * en `../../manifest`.
 */

import { panelComponentLoader, type ComponentResolver } from '../../manifest'
import type { RegisteredCenterTab } from '../../manifest'
import { ExtensionRegistry } from '../../registry'
import type { CenterTabContribution } from './schema'

export function registerCenterTab(
  contribution: CenterTabContribution,
  resolver: ComponentResolver,
  extensionId: string
): RegisteredCenterTab {
  ExtensionRegistry.registerPanel(
    {
      id: contribution.id,
      title: contribution.label,
      closable: contribution.closable,
      load: panelComponentLoader(resolver, contribution.component)
    },
    extensionId
  )

  const tab: RegisteredCenterTab = {
    id: contribution.id,
    label: contribution.label,
    icon: contribution.icon ? resolver.resolveIcon(contribution.icon) : undefined,
    panelId: contribution.id
  }
  ExtensionRegistry.registerCenterTab(tab, extensionId)
  return tab
}
