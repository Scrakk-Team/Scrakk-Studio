// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'activityBar' — estado persistido / desregistro.
 */

import { ExtensionRegistry } from '../../registry'
import type { ActivityBarButton } from '@features/activitybar'

export function unregisterActivityButtons(owned: ActivityBarButton[]): void {
  for (const button of owned) {
    ExtensionRegistry.unregisterActivityButton(button.id)
  }
}
