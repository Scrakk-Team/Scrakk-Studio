/**
 * Tipo 'panels' — estado persistido / desregistro.
 *
 * Los paneles en sí los guarda el ExtensionRegistry (fuente única de
 * verdad); acá vive solo la salida limpia por-id que usa el handler.
 */

import { ExtensionRegistry } from '../../registry'
import type { PanelEntry } from '@features/layout'

export function unregisterPanels(owned: PanelEntry[]): void {
  for (const entry of owned) {
    ExtensionRegistry.unregisterPanel(entry.id)
  }
}
