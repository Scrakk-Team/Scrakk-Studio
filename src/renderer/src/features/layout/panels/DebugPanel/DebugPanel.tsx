// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { usePanelTitle } from '@features/layout'
import styles from './DebugPanel.module.css'

/**
 * Panel de debug — APARTADO FALSO por el momento: placeholder sin backend
 * real. Solo aporta su contenido; el redimensionado y el frame los maneja
 * el sistema de layouts.
 */
export function DebugPanel(): JSX.Element {
  const { setTitle } = usePanelTitle()

  useEffect(() => {
    setTitle('Debug')
  }, [setTitle])

  return (
    <div className={styles.debug}>
      <div className={styles.placeholder}>
        <ProductIcon id="debug" size={24} className={styles.icon} aria-hidden="true" />
        <p className={styles.empty}>Debug no disponible todavía.</p>
      </div>
    </div>
  )
}
