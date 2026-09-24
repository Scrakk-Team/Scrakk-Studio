// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ActivityBarButton } from '../../types'
import { productIcon } from '@services/productIcons/components'

/** Botón de debug — barra izquierda, slot izquierdo. */
const debug: ActivityBarButton = {
  id: 'debug',
  label: 'Debug',
  icon: productIcon('debug'),
  side: 'left',
  target: 'left',
  panelId: 'debug',
  order: 40
}

export default debug
