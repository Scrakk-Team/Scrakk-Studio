/**
 * Activity Bar — barras laterales de botones (izquierda y derecha) estilo
 * VS Code. Cada botón es un módulo `.ts` con su propio folder; el registry
 * los detecta solo (`import.meta.glob`). Al hacer click activa/desactiva el
 * panel que declara en el slot que declara. Los íconos son componentes de
 * @proicons/react (igual que el resto de la app).
 */

import type { ComponentType } from 'react'
import type { PanelId, SlotId } from '@features/layout'

export type ActivityBarSide = 'left' | 'right'

export interface ActivityBarButton {
  /** Id único del botón. */
  id: string
  /** Tooltip / aria-label. */
  label: string
  /** Ícono proicons o SVG string (paneles de extensión). */
  icon: ComponentType<{ size?: number }> | string
  /** En qué barra lateral vive. */
  side: ActivityBarSide
  /** Slot del layout donde monta/desmonta el panel. */
  target: SlotId
  /** Panel que activa/desactiva. */
  panelId: PanelId
  /** Orden dentro de la barra (ascendente). */
  order?: number
}
