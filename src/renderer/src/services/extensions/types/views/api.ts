// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'views' — API hacia la capa extensions.
 */

import { ExtensionRegistry } from '../../registry'
import type { AnyExtensionTypeHandler, ExtensionTypeContext } from '../handler'
import { parseViewContributions, type ViewContribution } from './schema'
import { hasContainer } from '@features/extensionviews/containers'
import {
  DEFAULT_CONTAINER_ICON,
  buildViewButton,
  buildViewPanel,
  rememberContainerView
} from './logic'
import { unregisterViews } from './store'

export const viewsHandler: AnyExtensionTypeHandler = {
  kind: 'views',

  parse(raw, ctx): ViewContribution[] | null {
    return parseViewContributions(raw, ctx)
  },

  register(contribution: ViewContribution, ctx: ExtensionTypeContext) {
    // Varias vistas pueden compartir contenedor: el botón y el panel se crean
    // UNA sola vez por contenedor (se consulta ANTES de recordar la vista).
    const isNewContainer = !hasContainer(ctx.extensionId, contribution.container)
    const container = rememberContainerView(ctx.extensionId, {
      containerId: contribution.container,
      containerTitle: contribution.containerTitle,
      iconSvg: contribution.iconSvg ?? DEFAULT_CONTAINER_ICON,
      order: contribution.order,
      view: {
        id: contribution.id,
        name: contribution.name,
        when: contribution.when,
        welcome: contribution.welcome,
        collapsed: contribution.collapsed,
        hidden: contribution.hidden
      }
    })

    // El BOTÓN se (re)registra en cada vista: su cláusula `when` depende de
    // TODAS las vistas del contenedor, así que al llegar una nueva hay que
    // recalcularla (registrarlo de nuevo es idempotente por id). El panel se
    // crea una sola vez por contenedor.
    ExtensionRegistry.registerActivityButton(
      buildViewButton(contribution, ctx.extensionId, container),
      ctx.extensionId
    )
    if (isNewContainer) {
      ExtensionRegistry.registerPanel(
        buildViewPanel(contribution, ctx.extensionId),
        ctx.extensionId
      )
    }

    return {
      viewId: contribution.id,
      containerId: contribution.container,
      extensionId: ctx.extensionId,
      title: container.title
    }
  },

  unregister(owned) {
    unregisterViews(owned)
  }
}
