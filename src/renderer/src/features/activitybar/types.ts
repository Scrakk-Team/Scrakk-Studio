// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Activity Bar — barras laterales de botones (izquierda y derecha) estilo
 * VS Code. Cada botón es un módulo `.ts` con su propio folder; el registry
 * los detecta solo (`import.meta.glob`). Al hacer click activa/desactiva el
 * panel que declara en el slot que declara. Los íconos van por ID de
 * productIcons (resueltos por el registry global, temables por extensiones).
 */

import type { ComponentType } from 'react'
import type { PanelId, SlotId } from '@features/layout'

export type ActivityBarSide = 'left' | 'right'

export interface ActivityBarButton {
  /** Id único del botón. */
  id: string
  /** Tooltip / aria-label. */
  label: string
  /** Ícono por ID de productIcons (o SVG string en paneles de extensión). */
  icon: ComponentType<{ size?: number }> | string
  /** En qué barra lateral vive. */
  side: ActivityBarSide
  /** Slot del layout donde monta/desmonta el panel. */
  target: SlotId
  /** Panel que activa/desactiva. */
  panelId: PanelId
  /** Orden dentro de la barra (ascendente). */
  order?: number
  /**
   * Cláusula `when` sobre claves de contexto (`setContext`): si evalúa falso,
   * el botón no se muestra. Declarativo (un string), así el botón sigue
   * siendo data y lo evalúa quien lo pinta.
   */
  when?: string
}
