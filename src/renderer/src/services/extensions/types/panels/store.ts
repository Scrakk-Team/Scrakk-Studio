// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'panels' — estado persistido / desregistro.
 *
 * Los paneles en sí los guarda el ExtensionRegistry (fuente única de
 * verdad); aquí vive solo la salida limpia por-id que usa el handler.
 */

import { ExtensionRegistry } from '../../registry'
import type { PanelEntry } from '@features/layout'

export function unregisterPanels(owned: PanelEntry[]): void {
  for (const entry of owned) {
    ExtensionRegistry.unregisterPanel(entry.id)
  }
}
