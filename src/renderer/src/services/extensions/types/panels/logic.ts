/**
 * Tipo 'panels' — lógica de registro.
 *
 * Construye el PanelEntry que consume el sistema de layout de la app
 * (lógica movida tal cual desde loader/resolve.ts).
 */

import { lazy } from 'react'
import type { PanelEntry } from '@features/layout'
import type { ComponentResolver } from '../../manifest'
import type { PanelContribution } from './schema'

export function buildPanelEntry(
  contribution: PanelContribution,
  resolver: ComponentResolver
): PanelEntry {
  return {
    id: contribution.id,
    title: contribution.title,
    closable: contribution.closable,
    component: lazy(resolver.resolveComponent(contribution.component))
  }
}
