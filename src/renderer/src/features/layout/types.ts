import type { ComponentType } from 'react'

/**
 * Identificador de un panel registrado en el sistema de layouts.
 * Los built-in son 'chat' | 'history' | 'welcome' | 'explorer'; las
 * extensiones registran paneles con ids propios en runtime.
 */
export type PanelId = string

/**
 * Slots del layout. El sistema es modular tipo VS Code: CUALQUIER panel
 * registrado puede montarse en CUALQUIER slot (nada hardcodeado).
 * `bottom` es el slot inferior debajo del central (terminal).
 */
export type SlotId = 'left' | 'center' | 'right' | 'bottom'

/**
 * Entrada del registro de paneles.
 *
 * El componente no recibe props: los paneles que necesitan saber su propia
 * identidad la leen del contexto (`usePanelId()`, provisto por `PanelHost`).
 * Ver `state/PanelIdContext.tsx`.
 */
export interface PanelEntry {
  id: PanelId
  /** Título mostrado en el header del panel. */
  title: string
  /**
   * Import DINÁMICO del panel: resuelve al componente (built-in).
   *
   * `PanelHost` lo espera con `useState` + promesa, NUNCA con `React.lazy`:
   * acá el reintento del `Suspense` se pierde y el panel se queda en
   * "Cargando panel…" hasta cambiar de tab y volver (ver
   * `components/PanelHost/panelModules.ts`). Además es lo que permite
   * precargar (`preloadPanel`) y montar al instante desde el cache.
   */
  load?: () => Promise<ComponentType>
  /**
   * Componente ya montable. Lo usan los paneles de EXTENSIÓN: su componente es
   * un loader que gestiona su propia carga contra el Extension Host
   * (`ExtensionViewPanelLoader`), así que no necesitan `load`.
   */
  component?: ComponentType
  /** Si el panel se puede cerrar (X en el header). Default: true. */
  closable?: boolean
}
