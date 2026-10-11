// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Check de cuenta VERIFICADA, al lado del nombre.
 *
 * La marca sale del set de producto-icons (`verified-badge`): un sello con
 * puntas y el check hueco. Al ser un icono registrado, un tema de iconos de
 * producto lo puede overridear sin tocar la UI.
 */

import type { JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import styles from './VerifiedCheck.module.css'

import { t } from '@core/i18n'

export function VerifiedCheck({ size = 12 }: { size?: number }): JSX.Element {
  const label = t('social.verificada')
  return (
    <span className={styles.badge} title={label} role="img" aria-label={label}>
      <ProductIcon id="verified-badge" size={size} />
    </span>
  )
}
