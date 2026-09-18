/**
 * Entrada del panel "Inspeccionar tokens".
 *
 * Se abre de dos formas, y ninguna acopla la UI a quien la pide:
 *  - el comando `editor.inspectTokens` (paleta de comandos, o cualquier bridge),
 *  - el botón de la sección Resaltado de Ajustes.
 *
 * Las dos pasan por `openTokenInspector`, así que hay un solo lugar donde vive
 * la decisión de qué modal y de qué tamaño.
 */

import { commandRegistry } from '@services/commands'
import { showModal } from '@services/modals'
import { TokenInspector } from './TokenInspector'

/** Abre el panel de inspección del archivo activo. */
export function openTokenInspector(): void {
  showModal({
    title: 'Inspeccionar tokens',
    size: 'xl',
    render: () => <TokenInspector />
  })
}

/** Registra el comando en la paleta. Devuelve el unsubscribe. */
export function registerTokenInspectorCommand(): () => void {
  return commandRegistry.register(
    {
      id: 'editor.inspectTokens',
      title: 'Inspeccionar tokens del archivo activo',
      category: 'Editor',
      run: () => openTokenInspector()
    },
    { allowOverwrite: true }
  )
}

export { TokenInspector }
