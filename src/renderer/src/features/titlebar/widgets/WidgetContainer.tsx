// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { Suspense, type JSX } from 'react'
import { PanelErrorBoundary } from '@features/layout/components/PanelErrorBoundary/PanelErrorBoundary'
import { getTitlebarWidgets } from './registry'
import styles from './WidgetContainer.module.css'

/**
 * WidgetContainer — pinta los widgets registrados de la titlebar.
 *
 * Modular como el sistema de layouts: cada widget se registra en
 * `widgets/registry.ts` (id + lazy component) y aquí se monta con
 * Suspense + el PanelErrorBoundary de layouts (aislamiento por widget).
 */
export function WidgetContainer(): JSX.Element {
  const widgets = getTitlebarWidgets()
  if (widgets.length === 0) return <></>

  return (
    <div className={styles.container} role="group" aria-label="Widgets de la titlebar">
      {widgets.map((widget) => {
        const Component = widget.component
        return (
          <div key={widget.id} className={styles.widget} data-widget-id={widget.id}>
            <PanelErrorBoundary>
              <Suspense fallback={<span className={styles.fallback} aria-hidden="true" />}>
                <Component />
              </Suspense>
            </PanelErrorBoundary>
          </div>
        )
      })}
    </div>
  )
}
