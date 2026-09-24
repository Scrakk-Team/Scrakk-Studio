// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * SegmentedTabs — API global de tabs internas (segmented).
 *
 * Reutilizable en cualquier superficie que necesite 2+ pestañas sin cambiar de
 * sección. Sigue el lenguaje de la app: fondo `--color-hover`, tab activa con
 * fondo y radio chico, tipografía calmada.
 */

import type { JSX } from 'react'
import styles from './SegmentedTabs.module.css'

export interface SegmentedTabItem {
  id: string
  label: string
  /** Contador opcional a la derecha del label. */
  badge?: number | string
}

export interface SegmentedTabsProps {
  items: SegmentedTabItem[]
  activeId: string
  onChange: (id: string) => void
  ariaLabel?: string
}

export function SegmentedTabs({
  items,
  activeId,
  onChange,
  ariaLabel
}: SegmentedTabsProps): JSX.Element {
  return (
    <div className={styles.tabs} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.id === activeId
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={[styles.tab, active ? styles.tabActive : null].filter(Boolean).join(' ')}
            onClick={() => onChange(item.id)}
          >
            <span className={styles.label}>{item.label}</span>
            {item.badge !== undefined && item.badge !== '' ? (
              <span className={styles.badge}>{item.badge}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
