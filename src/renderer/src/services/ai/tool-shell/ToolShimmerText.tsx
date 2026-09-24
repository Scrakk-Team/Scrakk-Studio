// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ToolShimmerText — texto simple con efecto shimmer mientras una tool carga.
 *
 * Es el ESTILO COMPARTIDO de carga: cada tool lo importa desde su propia
 * carpeta visual/ y le pasa su texto (ej. "Leyendo archivo…"). El CSS vive
 * en este componente, así todas las tool cards se ven idénticas mientras
 * cargan (sin SVG, sin estilos globales automáticos).
 */

import type { JSX } from 'react'
import styles from './ToolShimmerText.module.css'

interface ToolShimmerTextProps {
  /** Texto del shimmer (default: "Cargando…"). */
  text?: string
}

export function ToolShimmerText({ text = 'Cargando…' }: ToolShimmerTextProps): JSX.Element {
  return <span className={styles.shimmer}>{text}</span>
}