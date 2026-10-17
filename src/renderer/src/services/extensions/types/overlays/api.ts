// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Overlays SEF — el HANDLER del tipo `overlays`.
 *
 * Igual que `panels`: el manifest apunta a un componente del paquete y el
 * resolver de la extensión devuelve el import perezoso. Lo único distinto es que
 * el overlay NO se monta en un slot del layout: lo monta el sistema de eventos
 * en su capa (efectos o background).
 */

import type { ComponentType } from 'react'
import type { AnyExtensionTypeHandler, ExtensionTypeContext } from '../handler'
import { parseOverlayContributions, type OverlayContribution } from './schema'
import { registerOverlay, unregisterOverlay, type OverlayComponentProps } from './logic'

interface RegisteredOverlayRef {
  id: string
}

export const overlaysHandler: AnyExtensionTypeHandler = {
  kind: 'overlays',

  parse(raw, ctx): OverlayContribution[] | null {
    return parseOverlayContributions(raw, ctx)
  },

  register(contribution: OverlayContribution, ctx: ExtensionTypeContext): RegisteredOverlayRef {
    // El resolver devuelve el import CRUDO del módulo del componente.
    const load = ctx.resolver.resolveComponent(contribution.component) as () => Promise<{
      default: ComponentType<OverlayComponentProps>
    }>

    registerOverlay({
      id: contribution.id,
      name: contribution.name,
      layer: contribution.layer ?? 'effects',
      extensionId: ctx.extensionId,
      isBuiltin: ctx.isBuiltin,
      load,
      props: contribution.props
    })

    return { id: contribution.id }
  },

  unregister(owned: RegisteredOverlayRef[]) {
    for (const ref of owned) unregisterOverlay(ref.id)
  }
}
