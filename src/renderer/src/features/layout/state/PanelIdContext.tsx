/**
 * Identidad del panel montado.
 *
 * El layout monta los paneles SIN props (`<Component />`): los paneles
 * builtin no necesitan saber quiénes son, y forzar un prop obligaría a
 * tipar props en todos (varios tienen las suyas, opcionales, y el contrato
 * se rompería por el chequeo de weak types).
 *
 * Así que la identidad viaja por CONTEXTO: `PanelHost` provee el id y sólo
 * los paneles que lo necesitan lo leen (los paneles de extensión derivan de
 * acá su contenedor y su vista).
 */

import { createContext, useContext, type JSX, type ReactNode } from 'react'
import type { PanelId } from '../types'

const PanelIdContext = createContext<PanelId | null>(null)

export function PanelIdProvider({
  panelId,
  children
}: {
  panelId: PanelId
  children: ReactNode
}): JSX.Element {
  return <PanelIdContext.Provider value={panelId}>{children}</PanelIdContext.Provider>
}

/** Id del panel montado, o null si se usa fuera de un panel. */
export function usePanelIdOptional(): PanelId | null {
  return useContext(PanelIdContext)
}

/** Id del panel montado (falla claro fuera de un panel). */
export function usePanelId(): PanelId {
  const panelId = useContext(PanelIdContext)
  if (panelId === null) {
    throw new Error('usePanelId() debe usarse dentro de un panel montado por PanelHost')
  }
  return panelId
}
