// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'activityBar' — API hacia la capa extensions.
 */

import { ExtensionRegistry } from '../../registry'
import type {
  AnyExtensionTypeHandler,
  ExtensionTypeContext
} from '../handler'
import {
  parseActivityBarContributions,
  type ActivityBarContribution
} from './schema'
import { buildActivityBarButton } from './logic'
import { unregisterActivityButtons } from './store'

export const activityBarHandler: AnyExtensionTypeHandler = {
  kind: 'activityBar',

  parse(raw, ctx): ActivityBarContribution[] | null {
    return parseActivityBarContributions(raw, ctx)
  },

  register(contribution: ActivityBarContribution, ctx: ExtensionTypeContext) {
    const button = buildActivityBarButton(contribution, ctx.resolver)
    ExtensionRegistry.registerActivityButton(button, ctx.extensionId)
    return button
  },

  unregister(owned) {
    unregisterActivityButtons(owned)
  }
}
