// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo de extensión 'keybindings' — API hacia la capa extensions.
 */

import type { AnyExtensionTypeHandler } from '../handler'
import { parseKeybindingContributions, type KeybindingContribution } from './schema'
import { activateKeybinding } from './logic'

interface RegisteredRef {
  dispose: () => void
}

export const keybindingsHandler: AnyExtensionTypeHandler = {
  kind: 'keybindings',

  parse(raw, ctx): KeybindingContribution[] | null {
    return parseKeybindingContributions(raw, ctx)
  },

  register(contribution, ctx): RegisteredRef {
    return { dispose: activateKeybinding(contribution, ctx) }
  },

  unregister(refs) {
    for (const ref of refs as RegisteredRef[]) ref.dispose?.()
  }
}
