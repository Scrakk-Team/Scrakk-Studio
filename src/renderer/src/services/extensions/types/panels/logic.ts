// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'panels' — lógica de registro.
 *
 * Construye el PanelEntry que consume el sistema de layout de la app
 * (lógica movida tal cual desde loader/resolve.ts).
 *
 * El panel se entrega como `load` (import dinámico del módulo de la
 * extensión), NO como componente `React.lazy`: el `PanelHost` del layout no
 * tiene Suspense, así que un `lazy` suspende sin boundary y el panel no monta
 * hasta el siguiente intento. `load` además lo hace cacheable y precargable
 * en hover, igual que los paneles built-in. El porqué completo (con las
 * mediciones) está en `panelComponentLoader` en `../../manifest`.
 */

import type { PanelEntry } from '@features/layout'
import { panelComponentLoader, type ComponentResolver } from '../../manifest'
import type { PanelContribution } from './schema'

export function buildPanelEntry(
  contribution: PanelContribution,
  resolver: ComponentResolver
): PanelEntry {
  return {
    id: contribution.id,
    title: contribution.title,
    closable: contribution.closable,
    load: panelComponentLoader(resolver, contribution.component)
  }
}
