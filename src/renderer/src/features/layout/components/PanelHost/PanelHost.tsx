import { Suspense, type JSX } from 'react'
import { getPanel } from '../../registry'
import type { PanelId } from '../../types'
import { PanelErrorBoundary } from '../PanelErrorBoundary/PanelErrorBoundary'
import styles from './PanelHost.module.css'

interface PanelHostProps {
  panelId: PanelId | null
}

/**
 * Host genérico de un panel: carga el componente registrado (lazy) dentro de
 * su propio ErrorBoundary. Si el componente peta, el error queda acá y no
 * tumba la app. La key aísla el boundary por panel: al cambiar de panel, el
 * estado de error anterior se descarta.
 */
export function PanelHost({ panelId }: PanelHostProps): JSX.Element | null {
  const entry = getPanel(panelId)
  if (!entry) return null
  const Component = entry.component
  return (
    <PanelErrorBoundary key={entry.id}>
      <Suspense fallback={<div className={styles.loading}>Cargando panel…</div>}>
        <Component />
      </Suspense>
    </PanelErrorBoundary>
  )
}
