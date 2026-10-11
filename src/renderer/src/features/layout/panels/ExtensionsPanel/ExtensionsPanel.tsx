// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, type JSX } from 'react'
import { usePanelTitle } from '@features/layout'
import { MarketPanel, MarketProvider } from '@features/market'
import styles from './ExtensionsPanel.module.css'

import { t } from '@core/i18n'
/**
 * Panel de extensiones → tienda. El frame, el header y el redimensionado los
 * maneja el sistema de layouts; acá vivimos el browse/search/detalle y la
 * publicación (metadata + releases del repo).
 */
export function ExtensionsPanel(): JSX.Element {
  const { setTitle } = usePanelTitle()

  useEffect(() => {
    setTitle(t('layout.panel.extensions'))
  }, [setTitle])

  return (
    <MarketProvider>
      <div className={styles.panel}>
        <MarketPanel />
      </div>
    </MarketProvider>
  )
}
