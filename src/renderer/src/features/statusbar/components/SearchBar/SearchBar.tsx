/**
 * SearchBar — trigger de la Command Palette en la statusbar.
 *
 * Click (o mod+shift+p) abre la paleta. El input real vive en el overlay.
 */

import { ProductIcon } from '@services/productIcons/components'
import type { JSX } from 'react'
import { openCommandPalette } from '@services/commands'
import styles from './SearchBar.module.css'

export function SearchBar(): JSX.Element {
  return (
    <button
      type="button"
      className={styles.wrapper}
      onClick={() => openCommandPalette()}
      title="Paleta de comandos (mod+shift+p)"
      aria-label="Abrir paleta de comandos"
    >
      <ProductIcon id="search" size={12} className={styles.icon} aria-hidden="true" />
      <span className={styles.label}>Comandos…</span>
    </button>
  )
}
