// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'panels' — API hacia la capa extensions.
 *
 * Implementa ExtensionTypeHandler con la estructura exacta que el loader
 * genérico entiende (parse → register → unregister).
 */

import { ExtensionRegistry } from '../../registry'
import type {
  AnyExtensionTypeHandler,
  ExtensionTypeContext
} from '../handler'
import { parsePanelContributions, type PanelContribution } from './schema'
import { buildPanelEntry } from './logic'
import { unregisterPanels } from './store'

export const panelsHandler: AnyExtensionTypeHandler = {
  kind: 'panels',

  parse(raw, ctx): PanelContribution[] | null {
    return parsePanelContributions(raw, ctx)
  },

  register(contribution: PanelContribution, ctx: ExtensionTypeContext) {
    const entry = buildPanelEntry(contribution, ctx.resolver)
    ExtensionRegistry.registerPanel(entry, ctx.extensionId)
    return entry
  },

  unregister(owned) {
    unregisterPanels(owned)
  }
}
