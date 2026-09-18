import type { ActivityBarButton } from '../../types'
import { productIcon } from '@services/productIcons/components'

/** Botón de git — barra derecha, slot derecho. */
const git: ActivityBarButton = {
  id: 'git',
  label: 'Git',
  icon: productIcon('source-control'),
  side: 'right',
  target: 'right',
  panelId: 'git',
  order: 30
}

export default git
