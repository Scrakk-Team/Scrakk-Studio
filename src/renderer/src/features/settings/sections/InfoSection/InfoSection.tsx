/**
 * Sección Acerca de — info del producto. Antes viva inline en el modal;
 * ahora es una sección más del registry (mismo markup y estilos).
 */

import type { JSX } from 'react'
import styles from './InfoSection.module.css'

export function InfoSection(): JSX.Element {
  return (
    <div className={styles.info}>
      <p><strong>Scrakk Studio</strong> — Editor de código.</p>
      <p>React + TypeScript + Electron. Sistema de paneles resizables y extensiones.</p>
      <p className={styles.version}>
        v{__APP_VERSION__} · build {__BUILD_ID__}
      </p>
    </div>
  )
}
