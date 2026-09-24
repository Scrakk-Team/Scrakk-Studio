// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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
