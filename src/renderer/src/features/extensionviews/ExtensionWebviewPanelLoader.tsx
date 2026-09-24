// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Cargador del panel de webview del EDITOR — import dinámico SIN Suspense.
 *
 * Mismo motivo que `ExtensionViewPanelLoader` (está documentado ahí con las
 * mediciones): el panel se registra en RUNTIME, cuando la extensión crea su
 * `WebviewPanel`, y con `React.lazy` el boundary de Suspense puede quedarse en
 * el fallback para siempre aunque el módulo termine de cargar.
 */

import { useEffect, useState, type ComponentType, type JSX } from 'react'
import styles from './ExtensionViewPanel.module.css'

export function ExtensionWebviewPanelLoader(): JSX.Element {
  const [Component, setComponent] = useState<ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void import('./ExtensionWebviewPanel')
      .then((mod) => {
        if (alive) setComponent(() => mod.ExtensionWebviewPanel)
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return (
      <div className={styles.overlay} role="status">
        <p className={styles.error}>No se pudo cargar el panel: {error}</p>
      </div>
    )
  }

  if (!Component) {
    return (
      <div className={styles.overlay} role="status">
        <p className={styles.hint}>Cargando panel…</p>
      </div>
    )
  }

  return <Component />
}
