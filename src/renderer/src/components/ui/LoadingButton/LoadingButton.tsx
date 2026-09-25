// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * LoadingButton — botón primitivo con estado de carga integrado.
 *
 * Misma convención que `IconButton`: extiende las props nativas de `<button>`,
 * tiene variantes/tamaños y se exporta desde `@ui`. La diferencia es el estado
 * `loading`: mientras está activo, envuelve el control con `LoadingBorder`
 * (borde animado que recorre los cuatro lados) y expone `loadingLabel` como
 * tooltip. Cualquier botón de la app puede ser uno de estos.
 *
 * La DURACIÓN MÍNIMA de visibilidad no vive aquí: la garantiza `withMinLoading`
 * (core/feedback.ts) para que animación y aviso compartan el mismo ritmo.
 */

import { type ComponentPropsWithoutRef, type JSX } from 'react'
import { LoadingBorder } from '../LoadingBorder/LoadingBorder'
import styles from './LoadingButton.module.css'

type LoadingButtonVariant = 'neutral' | 'accent' | 'danger'
type LoadingButtonSize = 'sm' | 'md'

interface LoadingButtonProps extends ComponentPropsWithoutRef<'button'> {
  /** Mientras es true: borde animado + `aria-busy`; el click queda bloqueado. */
  loading?: boolean
  /** Tooltip de fase mientras carga (p. ej. `Descargando… 42%`). */
  loadingLabel?: string
  variant?: LoadingButtonVariant
  size?: LoadingButtonSize
}

export function LoadingButton({
  loading = false,
  loadingLabel,
  variant = 'neutral',
  size = 'md',
  className,
  title,
  type = 'button',
  disabled,
  children,
  ...rest
}: LoadingButtonProps): JSX.Element {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(' ')

  return (
    <LoadingBorder loading={loading} label={loadingLabel}>
      <button
        className={classes}
        type={type}
        title={loading ? (loadingLabel ?? title) : title}
        disabled={disabled || loading}
        {...rest}
      >
        {children}
      </button>
    </LoadingBorder>
  )
}
