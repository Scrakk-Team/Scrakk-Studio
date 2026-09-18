import type { ActivityBarButton } from '../../types'
import { productIcon } from '@services/productIcons/components'

/** Botón del chat — barra derecha, slot derecho. */
const chat: ActivityBarButton = {
  id: 'chat',
  label: 'Chat',
  icon: productIcon('chat'),
  side: 'right',
  target: 'right',
  panelId: 'chat',
  order: 10
}

export default chat
