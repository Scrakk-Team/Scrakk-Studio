// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'views' — lógica de registro.
 *
 * Convierte una `ViewContribution` en DOS cosas del layout:
 *  - un **botón** de la activity bar (uno por contenedor), y
 *  - un **panel** (uno por contenedor) que monta el webview de la extensión.
 *
 * El mapa contenedor → vistas vive en `@features/extensionviews/containers`
 * (compartido con el panel, sin arrastrar React).
 */

import type { PanelEntry } from '@features/layout'
import type { ActivityBarButton } from '@features/activitybar'
import {
  containerWhenClause,
  getContainerViews,
  rememberContainerView,
  type ContainerEntry
} from '@features/extensionviews/containers'
// Ruta profunda a propósito: este módulo lo carga el BOOT de extensiones y
// no debe arrastrar el componente React del panel.
import { viewButtonId, viewPanelId } from '@features/extensionviews/ids'
import { ExtensionViewPanelLoader } from '@features/extensionviews/ExtensionViewPanelLoader'
import type { ViewContribution } from './schema'

/**
 * Icono por defecto de un contenedor sin icono propio: el mismo gesto que usa
 * VS Code (un conector). Se pinta con `currentColor` para seguir el tema,
 * igual que los iconos builtin.
 */
export const DEFAULT_CONTAINER_ICON = `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2v5a3 3 0 0 0 6 0V2"/><path d="M5 7h14v6a7 7 0 0 1-7 7 7 7 0 0 1-7-7V7Z"/></svg>`

export function buildViewPanel(
  contribution: ViewContribution,
  extensionId: string
): PanelEntry {
  return {
    id: viewPanelId(extensionId, contribution.container),
    title: contribution.containerTitle ?? contribution.name,
    closable: true,
    // El panel es de la FEATURE (core): la extensión sólo aporta metadata y
    // el contenido lo sirve el Extension Host por IPC.
    // El cargador NO usa `React.lazy` a propósito: ver el porqué (con las
    // mediciones) en `ExtensionViewPanelLoader.tsx`. El import sigue siendo
    // dinámico, así que el panel no entra al bundle principal.
    component: ExtensionViewPanelLoader
  }
}

export function buildViewButton(
  contribution: ViewContribution,
  extensionId: string,
  container: ContainerEntry
): ActivityBarButton {
  return {
    id: viewButtonId(extensionId, contribution.container),
    label: container.title,
    icon: container.iconSvg,
    side: 'left',
    target: 'left',
    panelId: viewPanelId(extensionId, contribution.container),
    order: container.order,
    // El botón se oculta si el `when` de TODAS sus vistas da falso.
    when: containerWhenClause(extensionId, contribution.container)
  }
}

export { getContainerViews, rememberContainerView }
