import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { useLayout } from '@features/layout'
import { formatTime, formatDate } from '../../shared/time'
import styles from './ClockPanel.module.css'

/**
 * Panel lateral de la extensión Clock — hora y fecha en vivo.
 * Se actualiza una vez por segundo; el timer se limpia al desmontar.
 *
 * También demuestra el flujo de tabs por ACCIÓN: su tab central
 * ("clock-dashboard") NO se monta en el strip por defecto; se abre con el
 * botón de abajo (o desde la activity bar).
 */
export default function ClockPanel(): JSX.Element {
  const { setSlotPanel } = useLayout()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className={styles.panel}>
      <span className={styles.time}>{formatTime(now)}</span>
      <span className={styles.date}>{formatDate(now)}</span>
      <button
        type="button"
        className={styles.openDashboard}
        onClick={() => setSlotPanel('center', 'clock-dashboard')}
      >
        <ProductIcon id="grid" size={14} aria-hidden="true" />
        Abrir dashboard
      </button>
    </div>
  )
}