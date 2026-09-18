import { useEffect, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { usePanelTitle } from '@features/layout'
import styles from './BrowserPanel.module.css'

/**
 * Panel de browser — APARTADO FALSO por el momento: placeholder sin
 * backend real (aún no implementado). Solo aporta su contenido; el
 * redimensionado y el frame los maneja el sistema de layouts.
 */
export function BrowserPanel(): JSX.Element {
  const { setTitle } = usePanelTitle()

  useEffect(() => {
    setTitle('Browser')
  }, [setTitle])

  return (
    <div className={styles.browser}>
      <div className={styles.placeholder}>
        <ProductIcon id="browser" size={24} className={styles.icon} aria-hidden="true" />
        <p className={styles.empty}>Browser no implementado todavía.</p>
      </div>
    </div>
  )
}
