import { ServerIcon, SettingsIcon } from '@proicons/react'
import type { JSX } from 'react'
import styles from './ProvidersMenu.module.css'

interface ProvidersMenuProps {
  onOpenProviders: () => void
}

/**
 * Menú flotante del panel derecho (abajo): Proveedores abre el modal;
 * Ajustes todavía no hace nada.
 */
export function ProvidersMenu({ onOpenProviders }: ProvidersMenuProps): JSX.Element {
  return (
    <div className={styles.menu}>
      <button type="button" className={styles.item} onClick={onOpenProviders}>
        <ServerIcon size={13} aria-hidden="true" />
        Proveedores
      </button>
      <button type="button" className={styles.item} disabled title="Próximamente">
        <SettingsIcon size={13} aria-hidden="true" />
        Ajustes
      </button>
    </div>
  )
}
