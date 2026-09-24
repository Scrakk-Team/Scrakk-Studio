// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ActivityBarButton } from '../../types'
import { productIcon } from '@services/productIcons/components'

/** Botón de notas — barra derecha, slot derecho. */
const notes: ActivityBarButton = {
  id: 'notes',
  label: 'Notas',
  icon: productIcon('note'),
  side: 'right',
  target: 'right',
  panelId: 'notes',
  order: 40
}

export default notes
