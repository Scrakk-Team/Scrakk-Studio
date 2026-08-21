import type { ActivityBarButton } from '../../types'
import { ChatIcon } from '@proicons/react'

/** Botón del chat — barra derecha, slot derecho. */
const chat: ActivityBarButton = {
  id: 'chat',
  label: 'Chat',
  icon: ChatIcon,
  side: 'right',
  target: 'right',
  panelId: 'chat',
  order: 10
}

export default chat
