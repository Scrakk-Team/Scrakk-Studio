/**
 * Tipo 'centerTabs' — lógica de registro.
 *
 * El contenido del tab también se registra como panel: así el PanelHost del
 * slot central lo monta con su ErrorBoundary + Suspense, igual que cualquier
 * otro panel. El id del tab ES el id del panel.
 */

import { lazy } from 'react'
import type { ComponentResolver } from '../../manifest'
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
      component: lazy(resolver.resolveComponent(contribution.component))
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
