// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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
