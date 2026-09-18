import { useEffect, useState, type ComponentType, type JSX } from 'react'
import { getPanel } from '../../registry'
import type { PanelEntry, PanelId } from '../../types'
import { PanelErrorBoundary } from '../PanelErrorBoundary/PanelErrorBoundary'
import { PanelIdProvider } from '../../state/PanelIdContext'
import { loadPanelComponent, loadedPanel } from './panelModules'
import styles from './PanelHost.module.css'

interface PanelHostProps {
  panelId: PanelId | null
}

/**
 * Host genérico de un panel: resuelve su módulo (import dinámico) y lo monta
 * dentro de su propio ErrorBoundary. Si el componente peta, el error queda
 * acá y no tumba la app: la key aísla el boundary por panel, así que al
 * cambiar de panel se descarta el error anterior.
 *
 * NO usa `<Suspense>`: el reintento del boundary se perdía y el panel quedaba
 * en "Cargando panel…" hasta cambiar de tab y volver. El porqué completo está
 * en `panelModules.ts`.
 */
export function PanelHost({ panelId }: PanelHostProps): JSX.Element | null {
  const entry = getPanel(panelId)
  if (!entry) return null
  return (
    <PanelErrorBoundary key={entry.id}>
      <PanelModule key={entry.id} entry={entry} />
    </PanelErrorBoundary>
  )
}

/**
 * Monta el componente de la entrada, esperando su import si hace falta.
 *
 * El estado inicial sale del CACHE (`loadedPanel`): un panel que ya se abrió
 * alguna vez se pinta en el primer render, sin fallback ni parpadeo. Sólo la
 * primera apertura de la sesión pasa por el "Cargando panel…" — y con el
 * preload (hover del botón / idle del arranque) casi nunca se ve.
 */
export function PanelModule({ entry }: { entry: PanelEntry }): JSX.Element | null {
  // Paneles de extensión de vista: su `component` ya es un loader que se
  // auto-gestiona. El resto llega por `load` (cacheado en panelModules).
  const [Component, setComponent] = useState<ComponentType | null>(() =>
    entry.load ? loadedPanel(entry.id) : (entry.component ?? null)
  )
  const [error, setError] = useState<string | null>(null)
  /** Sube al tocar "Reintentar": vuelve a disparar el import. */
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (Component) return undefined
    let alive = true
    void loadPanelComponent(entry)
      .then((resolved) => {
        if (alive) setComponent(() => resolved)
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      alive = false
    }
  }, [entry, Component, attempt])

  if (error) {
    return (
      <div className={styles.error} role="alert">
        <p className={styles.errorTitle}>No se pudo cargar el panel</p>
        <p className={styles.errorDetail}>{error}</p>
        <button
          type="button"
          className={styles.retry}
          onClick={() => {
            setError(null)
            setAttempt((value) => value + 1)
          }}
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (!Component) return <div className={styles.loading}>Cargando panel…</div>

  return (
    <PanelIdProvider panelId={entry.id}>
      <Component />
    </PanelIdProvider>
  )
}
