/**
 * SearchBar — barra de búsqueda en la statusbar.
 *
 * Componente visual por ahora: input con ícono de búsqueda.
 * Se integra en el extremo izquierdo de la StatusBar.
 */

import { SearchIcon } from '@proicons/react'
import type { JSX } from 'react'
import styles from './SearchBar.module.css'

interface SearchBarProps {
  placeholder?: string
}

export function SearchBar({ placeholder = 'Buscar…' }: SearchBarProps): JSX.Element {
  return (
    <div className={styles.wrapper}>
      <SearchIcon size={12} className={styles.icon} aria-hidden="true" />
      <input
        type="text"
        className={styles.input}
        placeholder={placeholder}
        aria-label="Buscar"
        disabled
      />
    </div>
  )
}
