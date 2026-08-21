import { CloseIcon } from '@proicons/react'
import type { JSX, ReactNode } from 'react'
import { IconButton } from '@ui/IconButton'
import { PanelTitleProvider, usePanelTitle } from '../../state'
import styles from './PanelFrame.module.css'

interface PanelFrameProps {
  title: string
  closable?: boolean
  onClose?: () => void
  children: ReactNode
}

/**
 * Marco genérico de un panel: header con título + acciones del panel +
 * botón de cierre y área de contenido. La superficie la pinta el frame
 * (el layout), no el panel, así cualquier componente montado queda con el
 * mismo aspecto.
 *
 * Provee el PanelTitleContext para que el panel pueda cambiar su título y
 * sus acciones en runtime (ej. el Explorer muestra el nombre de la carpeta
 * abierta y sus botones viven en el header).
 */
export function PanelFrame({
  title,
  closable = false,
  onClose,
  children
}: PanelFrameProps): JSX.Element {
  return (
    <PanelTitleProvider initialTitle={title}>
      <PanelFrameInner closable={closable} onClose={onClose}>
        {children}
      </PanelFrameInner>
    </PanelTitleProvider>
  )
}

function PanelFrameInner({
  closable,
  onClose,
  children
}: {
  closable: boolean
  onClose?: () => void
  children: ReactNode
}): JSX.Element {
  // Título + acciones dinámicos: si el panel los cambió, ganan.
  const { title, actions } = usePanelTitle()

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <span className={styles.title} title={title ?? undefined}>
          {title}
        </span>
        {actions ? <div className={styles.actions}>{actions()}</div> : null}
        {closable ? (
          <IconButton label="Cerrar panel" size="sm" onClick={onClose}>
            <CloseIcon size={12} />
          </IconButton>
        ) : null}
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  )
}
