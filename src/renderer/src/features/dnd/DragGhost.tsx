import type { JSX } from 'react'
import { useDndState } from './hooks'
import styles from './DragGhost.module.css'

/** Offset del ghost respecto al cursor (para que el label no tape el puntero). */
const OFFSET_X = 12
const OFFSET_Y = 14

/**
 * Ghost flotante del drag: un chip con el label de la tab que se está
 * moviendo, siguiendo al cursor. Se monta a nivel de layout (sobre todo).
 */
export function DragGhost(): JSX.Element | null {
  const { phase, payload, x, y } = useDndState()
  if (phase !== 'dragging' || !payload) return null
  const label = payload.label ?? payload.tabId
  return (
    <div
      className={styles.ghost}
      style={{ transform: `translate(${x + OFFSET_X}px, ${y + OFFSET_Y}px)` }}
      role="presentation"
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </div>
  )
}
