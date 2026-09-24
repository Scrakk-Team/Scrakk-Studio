// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ActivityBarButton } from '../../types'
import { productIcon } from '@services/productIcons/components'

/** Botón del browser — barra izquierda, slot izquierdo. */
const browser: ActivityBarButton = {
  id: 'browser',
  label: 'Browser',
  icon: productIcon('browser'),
  side: 'left',
  target: 'left',
  panelId: 'browser',
  order: 30
}

export default browser
