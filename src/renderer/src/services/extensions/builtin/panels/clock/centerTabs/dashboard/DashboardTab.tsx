// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState, type JSX } from 'react'
import { formatTime, formatDate } from '../../shared/time'
import styles from './DashboardTab.module.css'

/**
 * Tab central de la extensión Clock — dashboard con hora y fecha.
 * El contenido se monta en el slot central (id "clock-dashboard").
 */
export default function DashboardTab(): JSX.Element {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className={styles.dashboard}>
      <div className={styles.card}>
        <span className={styles.label}>Hora</span>
        <span className={styles.time}>{formatTime(now)}</span>
      </div>
      <div className={styles.card}>
        <span className={styles.label}>Fecha</span>
        <span className={styles.date}>{formatDate(now)}</span>
      </div>
    </div>
  )
}