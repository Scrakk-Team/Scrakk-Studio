// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { JSX } from 'react'
import { useDndState } from './hooks'
import styles from './SplitOverlay.module.css'

/**
 * Overlay del split direccional (estilo VS Code): cuando el drag está sobre
 * el borde de una zona con `isSplit`, muestra la banda translúcida del color
 * de acento del tema indicando dónde se partiría el panel. Adentro lleva el
 * separador: la MISMA separación que hay entre paneles (la cápsula del
 * ResizeHandle, 3×56) pero CUADRADA — sin el redondeo —, clavada en el
 * borde interior de la banda, en la línea exacta donde caería la división.
 * Se monta a nivel de layout (sobre todo), como el DragGhost.
 */
export function SplitOverlay(): JSX.Element | null {
  const { phase, overlay } = useDndState()
  if (phase !== 'dragging' || !overlay) return null
  return (
    <div
      className={styles.overlay}
      style={{ transform: `translate(${overlay.x}px, ${overlay.y}px)`, width: overlay.w, height: overlay.h }}
      role="presentation"
    >
      <div className={styles.separator} data-edge={overlay.edge} aria-hidden="true" />
    </div>
  )
}