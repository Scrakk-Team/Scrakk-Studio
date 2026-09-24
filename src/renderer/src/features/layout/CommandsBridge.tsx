// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * CommandsBridge — registra los comandos de layout en el registry central.
 *
 * Vive DENTRO de LayoutProvider (necesita useLayout). Mismo patrón que
 * LayoutShortcuts: un componente puente sin UI.
 */

import { useEffect, type JSX } from 'react'
import { useLayout } from './state'
import { commandRegistry } from '@services/commands'
import { toggleHistoryView } from './panels/HistoryPanel/viewState'

interface ToggleDef {
  id: string
  title: string
  slot: 'left' | 'right' | 'center'
  panelId: string
  keybinding?: string
}

const TOGGLES: ToggleDef[] = [
  { id: 'layout.toggleChat', title: 'Mostrar/ocultar chat', slot: 'right', panelId: 'chat', keybinding: 'mod+j' },
  { id: 'layout.toggleExplorer', title: 'Mostrar/ocultar explorador', slot: 'left', panelId: 'explorer', keybinding: 'mod+b' }
]

export function LayoutCommandsBridge(): JSX.Element | null {
  const { slots, toggleSlotPanel, openPanelTab } = useLayout()

  useEffect(() => {
    const unsubs = TOGGLES.map((def) =>
      commandRegistry.register({
        id: def.id,
        title: def.title,
        category: 'Paneles',
        keybinding: def.keybinding,
        run: () => toggleSlotPanel(def.slot as never, def.panelId as never)
      })
    )
    return () => unsubs.forEach((unsub) => unsub())
  }, [toggleSlotPanel])

  // El historial ya no es un panel: es una vista DENTRO del chat. El comando
  // (y su atajo) abre el panel de chat y alterna esa vista — así el atajo
  // sigue funcionando aunque el chat esté cerrado o en otra tab.
  useEffect(() => {
    const unsub = commandRegistry.register({
      id: 'layout.toggleHistory',
      title: 'Mostrar/ocultar historial de chats',
      category: 'Paneles',
      keybinding: 'mod+alt+h',
      run: () => {
        openPanelTab('right', 'chat')
        toggleHistoryView()
      }
    })
    return unsub
  }, [openPanelTab])

  // Los slots se leen solo para que el hook reaccione al estado actual.
  void slots
  return null
}
