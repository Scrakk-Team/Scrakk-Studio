import type { ActivityBarButton } from '../../types'
import { productIcon } from '@services/productIcons/components'

/** Botón del panel Social — barra derecha, slot derecho. */
const social: ActivityBarButton = {
  id: 'social',
  label: 'Social',
  icon: productIcon('people'),
  side: 'right',
  target: 'right',
  panelId: 'social',
  order: 15
}

export default social
