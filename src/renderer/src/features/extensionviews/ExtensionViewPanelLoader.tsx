// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Cargador del panel de extensión — import dinámico SIN Suspense.
 *
 * ¿POR QUÉ NO `React.lazy`?
 *
 * El registro de este panel ocurre en RUNTIME (cuando la extensión se carga),
 * no al importar el módulo de la app. Con `lazy()`, si el módulo resuelve
 * después del render que suspendió, React tiene que re-renderizar el boundary
 * `Suspense` de `PanelHost` para montarlo. Ese aviso se pierde en este caso:
 * medido en la app de producción (React 19.2) con el panel de una extensión
 * real, la secuencia es
 *
 *   PanelHost render … true        ← monta el lazy → suspende → fallback
 *   PanelHost render … true        ← React reintenta (sigue pendiente)
 *   [módulo evaluado]              ← el import TERMINA bien
 *   (nada más: el fallback se queda para siempre)
 *
 * …o sea el chunk carga y el panel nunca monta. Un `useState` + import
 * dinámico no depende de ese aviso: cuando el módulo llega, React re-renderiza
 * como cualquier otro setState. Se sigue sin arrastrar el panel al bundle
 * principal (el import es dinámico).
 *
 * Si algún día el retry de Suspense se comporta, esto puede volver a `lazy()`
 * sin cambiar nada más (el `PanelEntry.component` es la única costura).
 */

import { useEffect, useState, type ComponentType, type JSX } from 'react'
import styles from './ExtensionViewPanel.module.css'

export function ExtensionViewPanelLoader(): JSX.Element {
  const [Component, setComponent] = useState<ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void import('./ExtensionViewPanel')
      .then((mod) => {
        if (alive) setComponent(() => mod.ExtensionViewPanel)
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
