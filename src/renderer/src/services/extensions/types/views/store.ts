/**
 * Tipo 'views' — desregistro.
 *
 * Al desinstalar/desactivar una extensión hay que liberar TODO lo que aportó:
 * botones de la activity bar, paneles y el mapa contenedor → vistas. El
 * `extensionId` viaja en lo registrado (el `unregister` del contrato de tipo
 * sólo recibe `owned`).
 */

import { forgetContainerExtension } from '@features/extensionviews/containers'
import { viewButtonId, viewPanelId } from '@features/extensionviews/ids'
import { ExtensionRegistry } from '../../registry'

interface OwnedView {
  viewId: string
  containerId: string
  extensionId: string
}

export function unregisterViews(owned: OwnedView[]): void {
  if (owned.length === 0) return
  const extensionId = owned[0].extensionId
  const containers = new Set(owned.map((o) => o.containerId))
  for (const containerId of containers) {
    ExtensionRegistry.unregisterActivityButton(viewButtonId(extensionId, containerId))
    ExtensionRegistry.unregisterPanel(viewPanelId(extensionId, containerId))
  }
  forgetContainerExtension(extensionId)
}
