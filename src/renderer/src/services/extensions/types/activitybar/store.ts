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
