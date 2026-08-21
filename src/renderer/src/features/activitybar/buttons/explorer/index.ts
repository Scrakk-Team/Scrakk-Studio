import type { ActivityBarButton } from '../../types'
import { FolderIcon } from '@proicons/react'

/** Botón del explorador de archivos — barra izquierda, slot izquierdo. */
const explorer: ActivityBarButton = {
  id: 'explorer',
  label: 'Explorador',
  icon: FolderIcon,
  side: 'left',
  target: 'left',
  panelId: 'explorer',
  order: 10
}

export default explorer
