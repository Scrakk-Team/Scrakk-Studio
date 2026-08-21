import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type { PanelId, SlotId } from '../types'
import {
  getPersistedLayoutSlots,
  persistLayoutSlots
} from '@services/storage'

export type LayoutSlots = Record<SlotId, PanelId | null>

interface LayoutContextValue {
  /** Qué panel está montado en cada slot. null = slot oculto. */
  slots: LayoutSlots
  /** Monta (o desmonta con null) un panel en un slot. */
  setSlotPanel: (slot: SlotId, panelId: PanelId | null) => void
  /** Alterna un panel en un slot: lo monta si no está, lo desmonta si ya está. */
  toggleSlotPanel: (slot: SlotId, panelId: PanelId) => void
}

/**
 * Distribución inicial: leída del storage persistente; si no hay nada guardado
 * se usa el default (left=explorer, center=welcome, right=chat).
 */
const DEFAULT_LAYOUT: LayoutSlots = {
  left: 'explorer',
  center: 'welcome',
  right: 'chat'
}

const LayoutContext = createContext<LayoutContextValue | null>(null)

export function LayoutProvider({
  children,
  initialLayout = DEFAULT_LAYOUT
}: {
  children: ReactNode
  initialLayout?: LayoutSlots
}) {
  const [slots, setSlots] = useState<LayoutSlots>(() => {
    // Seed desde storage; si no hay nada, usa el initialLayout prop.
    const persisted = getPersistedLayoutSlots()
    return persisted ?? initialLayout
  })

  // Persiste cada cambio de layout.
  useEffect(() => {
    persistLayoutSlots(slots)
  }, [slots])

  const setSlotPanel = useCallback((slot: SlotId, panelId: PanelId | null): void => {
    setSlots((current) => ({ ...current, [slot]: panelId }))
  }, [])

  const toggleSlotPanel = useCallback((slot: SlotId, panelId: PanelId): void => {
    setSlots((current) => ({
      ...current,
      [slot]: current[slot] === panelId ? null : panelId
    }))
  }, [])

  const value = useMemo(
    () => ({ slots, setSlotPanel, toggleSlotPanel }),
    [slots, setSlotPanel, toggleSlotPanel]
  )

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
}

export function useLayout(): LayoutContextValue {
  const context = useContext(LayoutContext)
  if (!context) {
    throw new Error('useLayout debe usarse dentro de <LayoutProvider>')
  }
  return context
}
