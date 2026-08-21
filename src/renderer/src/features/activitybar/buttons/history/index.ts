import type { ActivityBarButton } from '../../types'
import { HistoryIcon } from '@proicons/react'

/** Botón del historial — barra derecha, slot derecho. */
const history: ActivityBarButton = {
  id: 'history',
  label: 'Historial',
  icon: HistoryIcon,
  side: 'right',
  target: 'right',
  panelId: 'history',
  order: 20
}

export default history
