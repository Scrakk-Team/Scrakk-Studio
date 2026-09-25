// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * LoadingBorder — envuelve UN control con un borde animado mientras carga.
 *
 * A diferencia de una barra aparte, el feedback vive pegado al botón que
 * disparó la acción: no hay que buscar "qué se está cargando", se ve en el
 * propio control. El borde recorre los cuatro lados (conic-gradient rotando),
 * con el color de acento del tema.
 *
 * La duración mínima de visibilidad NO vive aquí: la garantiza `withMinLoading`
 * (core/feedback.ts) para que el mismo ritmo aplique a la animación y al aviso.
 */

import type { JSX, ReactNode } from 'react'
import styles from './LoadingBorder.module.css'

interface LoadingBorderProps {
  /** Si carga: pinta el borde animado. Si no, renderiza el hijo tal cual. */
  loading: boolean
  /** Texto de fase (p. ej. `Descargando… 42%`) expuesto como tooltip. */
  label?: string
  children: ReactNode
}

export function LoadingBorder({ loading, label, children }: LoadingBorderProps): JSX.Element {
  if (!loading) return <>{children}</>

  return (
    <span className={styles.wrap} title={label} aria-busy="true">
      {children}
    </span>
  )
}
