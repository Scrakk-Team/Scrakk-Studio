/**
 * SelectionBox — div pre-renderizado con display: none.
 *
 * Las posiciones y dimensiones se actualizan via DOM directo
 * (box.style.*) desde el hook useSelectionBox, sin pasar por
 * React state. Esto garantiza 60fps durante el drag.
 */

import { forwardRef, type JSX } from 'react'
import styles from './SelectionBox.module.css'

export const SelectionBox = forwardRef<HTMLDivElement>(function SelectionBox(
  _props,
  ref
): JSX.Element {
  return (
    <div
      ref={ref}
      className={styles.box}
      style={{ display: 'none' }}
      aria-hidden="true"
    />
  )
})
