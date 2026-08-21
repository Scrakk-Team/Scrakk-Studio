import type { JSX, ReactNode } from 'react'
import styles from './AppShell.module.css'

interface AppShellProps {
  children: ReactNode
}

/**
 * Módulo de layout — estructura base de la ventana:
 * titlebar arriba + contenido que llena el resto.
 */
export function AppShell({ children }: AppShellProps): JSX.Element {
  return <div className={styles.shell}>{children}</div>
}
