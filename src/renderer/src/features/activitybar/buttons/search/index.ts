import type { ActivityBarButton } from '../../types'
import { productIcon } from '@services/productIcons/components'

/** Botón de búsqueda — barra izquierda, slot izquierdo. */
const search: ActivityBarButton = {
  id: 'search',
  label: 'Búsqueda',
  icon: productIcon('search'),
  side: 'left',
  target: 'left',
  panelId: 'search',
  order: 20
}

export default search
