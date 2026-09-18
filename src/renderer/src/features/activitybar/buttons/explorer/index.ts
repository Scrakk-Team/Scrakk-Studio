import type { ActivityBarButton } from '../../types'
import { productIcon } from '@services/productIcons/components'

/** Botón del explorador de archivos — barra izquierda, slot izquierdo. */
const explorer: ActivityBarButton = {
  id: 'explorer',
  label: 'Explorador',
  icon: productIcon('files'),
  side: 'left',
  target: 'left',
  panelId: 'explorer',
  order: 10
}

export default explorer
