// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * LoadingBar — barra de progreso única del IDE.
 *
 * Determinada cuando hay un porcentaje REAL (p. ej. la descarga de un release
 * LSP); indeterminada cuando no lo hay (subprocesos npm/go, arranques,
 * listados). Mostrar un % inventado sería mentir al usuario: por eso el
 * default es barrido, no relleno falso.
 *
 * La usan TODOS los procesos de carga de una zona para que el feedback sea el
 * mismo en cualquier operación.
 */

import type { JSX } from 'react'
import styles from './LoadingBar.module.css'

interface LoadingBarProps {
  /** 0–100 para barra determinada. Sin valor → indeterminada. */
  percentage?: number
  /** Texto de estado (fase / qué se está cargando). */
  label?: string
  /** Compacta: para filas densas (ocupa todo el ancho disponible). */
  compact?: boolean
}

export function LoadingBar({ percentage, label, compact }: LoadingBarProps): JSX.Element {
  const determinate = typeof percentage === 'number' && Number.isFinite(percentage)

  return (
    <div className={[styles.wrap, compact ? styles.compact : null].filter(Boolean).join(' ')}>
      <div
        className={[styles.track, determinate ? null : styles.indeterminate]
          .filter(Boolean)
          .join(' ')}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? percentage : undefined}
      >
        <div className={styles.fill} style={determinate ? { width: `${percentage}%` } : undefined} />
      </div>
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  )
}
