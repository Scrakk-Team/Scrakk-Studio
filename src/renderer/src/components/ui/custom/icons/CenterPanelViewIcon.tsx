// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * CenterPanelViewIcon — ícono custom del proyecto.
 *
 * Marco limpio (mismo rectángulo redondeado del PanelLeftIcon de
 * @proicons/react: mismo radio y mismo trazo, sin raya divisoria) con un
 * cuadrado interior relleno de las mismas esquinas redondeadas, dejando
 * un espacio alrededor para diferenciar el borde del marco.
 *
 * Vive en el repo (no en node_modules) para no pelearse con el cache de
 * Vite: cada vez que Vite pre-bundlea @proicons/react, el HMR puede
 * quedar sirviendo un snapshot viejo del barrel y tirar
 *   "does not provide an export named 'CenterPanelViewIcon'"
 * aunque el .d.ts y el proicons-react.js estén al día. Componente inline
 * con el mismo contrato (`size`, `className`, `style`) que el resto de
 * los íconos proicons → drop-in replacement.
 */

import type { JSX, SVGProps } from 'react'

export interface CenterPanelViewIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
  /**
   * Muestra el cuadrado interior relleno. Con `active={false}` (panel
   * desactivado) queda solo el marco vacío.
   */
  active?: boolean
}

export function CenterPanelViewIcon({
  size = 24,
  className,
  active = true,
  ...rest
}: CenterPanelViewIconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className ? `${className} proicon` : 'proicon'}
      data-proicon-id="center-panel-view"
      {...rest}
    >
      <path
        d="M3.75 7.25a3.5 3.5 0 0 1 3.5-3.5h9.5a3.5 3.5 0 0 1 3.5 3.5v9.5a3.5 3.5 0 0 1-3.5 3.5h-9.5a3.5 3.5 0 0 1-3.5-3.5z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      {active && (
        <path
          d="M9.25 5.75h5.5a3.5 3.5 0 0 1 3.5 3.5v5.5a3.5 3.5 0 0 1-3.5 3.5h-5.5a3.5 3.5 0 0 1-3.5-3.5v-5.5a3.5 3.5 0 0 1 3.5-3.5z"
          fill="currentColor"
        />
      )}
    </svg>
  )
}