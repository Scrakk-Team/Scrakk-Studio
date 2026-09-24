// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ChatModeBar — barra superior del input de chat.
 *
 * RESERVADA: no muestra el modo (eso vive en el glow + <ModeLabel />) ni el
 * modelo (ModelPicker en el input) ni el workspace (Explorer). Queda como
 * contenedor para controles futuros — ej. confirmaciones de tools del
 * policy engine (confirmation bus) — sin contenido propio por ahora.
 *
 * Si no recibe hijos no pinta nada: evita la "tapa" vacía sobre el input.
 */

import type { JSX, ReactNode } from 'react'
import styles from './ChatModeBar.module.css'

export function ChatModeBar({ children }: { children?: ReactNode }): JSX.Element | null {
  if (!children) return null
  return <div className={styles.bar}>{children}</div>
}