// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Fantasma del drag: copia del icono del botón que sigue al cursor.
 *
 * Se renderiza en un PORTAL a `document.body` (no dentro de la barra): un
 * tema con `backdrop-filter`/`filter`/`transform` en la ActivityBar crea un
 * bloque contenedor para `position: fixed`, y el fantasma quedaba recortado
 * por el `overflow` de la barra. En el body nunca se recorta ni se desplaza.
 */

import { createPortal } from 'react-dom'
import type { JSX } from 'react'
import { sanitizeSvgIcon } from '@services/extensions/svgIcon'
import { allActivityButtons } from './layout'
import styles from './DragGhost.module.css'

export function DragGhost({
  id,
  x,
  y
}: {
  id: string | null
  x: number
  y: number
}): JSX.Element | null {
  if (!id) return null
  const button = allActivityButtons().find((candidate) => candidate.id === id)
  if (!button) return null
  const Icon = typeof button.icon === 'string' ? null : button.icon
  return createPortal(
    <div className={styles.ghost} style={{ left: x, top: y }} aria-hidden="true">
      {Icon ? (
        <Icon size={20} />
      ) : (
        <span
          className={styles.icon}
          dangerouslySetInnerHTML={{ __html: sanitizeSvgIcon(button.icon as string) ?? '' }}
        />
      )}
    </div>,
    document.body
  )
}
