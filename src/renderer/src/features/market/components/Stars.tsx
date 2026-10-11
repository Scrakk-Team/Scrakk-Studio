// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { JSX } from 'react'
import styles from '../market.module.css'

interface StarsProps {
  value: number
  /** Si viene, las estrellas son clickeables (ratear). */
  onRate?: (value: number) => void
}

/** Estrellas 1–5. Display o input según `onRate`. */
export function Stars({ value, onRate }: StarsProps): JSX.Element {
  const rounded = Math.round(value)
  if (!onRate) {
    return (
      <span className={styles.stars} aria-label={`${value.toFixed(1)} / 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={[styles.star, n <= rounded ? styles.starOn : null].filter(Boolean).join(' ')}
            aria-hidden="true"
          >
            ★
          </span>
        ))}
      </span>
    )
  }
  return (
    <span className={styles.stars} role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n <= rounded}
          className={[styles.star, styles.starBtn, n <= rounded ? styles.starOn : null]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onRate(n)}
        >
          ★
        </button>
      ))}
    </span>
  )
}
