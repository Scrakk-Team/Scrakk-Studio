/**
 * ToggleSwitch — interruptor cuadrado con role="switch".
 *
 * Track cuadrado (radius-sm) + thumb cuadrado que desliza. Encendido =
 * acento de la app; apagado = superficie con borde. Accesible por teclado
 * (es un <button> nativo) y con foco visible.
 */

import type { JSX } from 'react'
import styles from './ToggleSwitch.module.css'

interface ToggleSwitchProps {
  /** Estado actual. */
  checked: boolean
  /** Se llama con el estado siguiente. */
  onChange: (next: boolean) => void
  /** Nombre accesible (aria-label). */
  label: string
  disabled?: boolean
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false
}: ToggleSwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={[styles.track, checked ? styles.on : null].filter(Boolean).join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} aria-hidden="true" />
    </button>
  )
}
