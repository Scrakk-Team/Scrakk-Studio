import type { JSX } from 'react'
import { Modal } from '@ui'
import { ProvidersPanel } from '../ProvidersPanel/ProvidersPanel'

interface ProvidersModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Wrapper delgado del panel de proveedores dentro de un modal.
 *
 * La UI real vive en `ProvidersPanel` (sin modal) porque Ajustes la embebe
 * como sección; este componente queda para abrirla como overlay cuando haga
 * falta (p. ej. un flujo que no pase por Ajustes).
 */
export function ProvidersModal({ open, onClose }: ProvidersModalProps): JSX.Element {
  return (
    <Modal open={open} onClose={onClose} title="Proveedores">
      <ProvidersPanel />
    </Modal>
  )
}
