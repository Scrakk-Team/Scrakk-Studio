// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'centerTabs' — estado persistido / desregistro.
 * Remueve la tab Y el panel que monta su contenido.
 */

import type { PanelId } from '@features/layout'
import { ExtensionRegistry } from '../../registry'
import type { RegisteredCenterTab } from '../../manifest'

export function unregisterCenterTabs(owned: RegisteredCenterTab[]): void {
  for (const tab of owned) {
    ExtensionRegistry.unregisterCenterTab(tab.id)
    ExtensionRegistry.unregisterPanel(tab.panelId as PanelId)
  }
}
