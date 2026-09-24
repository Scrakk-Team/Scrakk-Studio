// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { ProductIcon } from '@services/productIcons/components'
import type { JSX } from 'react'
import styles from './ProvidersMenu.module.css'

interface ProvidersMenuProps {
  onOpenProviders: () => void
}

/**
 * Menú flotante del panel derecho (abajo): Proveedores abre el modal.
 *
 * Tuvo un botón "Ajustes" deshabilitado (placeholder "Próximamente") que se
 * quitó: los ajustes ya tienen su propia puerta en la barra de estado, y un
 * botón muerto al lado de la lista de chats sólo confunde.
 */
export function ProvidersMenu({ onOpenProviders }: ProvidersMenuProps): JSX.Element {
  return (
    <div className={styles.menu}>
      <button type="button" className={styles.item} onClick={onOpenProviders}>
        <ProductIcon id="server" size={13} aria-hidden="true" />
        Proveedores
      </button>
    </div>
  )
}
