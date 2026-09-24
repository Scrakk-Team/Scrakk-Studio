// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

export { LayoutProvider, useLayout } from './state'
export type { LayoutSlots } from './state'
export {
  PanelTitleProvider,
  PanelTitleAutoProvider,
  usePanelTitle,
  usePanelTitleValue,
  usePanelTitleOptional
} from './state'
// Botón de header ARRASTRABLE: la API para agregar acciones a un header.
export { HeaderActionButton } from './components/HeaderActionButton/HeaderActionButton'
export type { HeaderActionButtonProps } from './components/HeaderActionButton/HeaderActionButton'
// Store del orden de esos botones (lo mismo que la activity bar, en fila).
export {
  orderHeaderActions,
  moveHeaderAction,
  resetHeaderActions,
  snapshotHeaderActions,
  restoreHeaderActions,
  subscribeToHeaderActions
} from './state'
export type { HeaderActionLike } from './state'
// Visibilidad de la vista de historial (embebida en el panel de chat).
export {
  isHistoryViewOpen,
  setHistoryViewOpen,
  toggleHistoryView,
  subscribeToHistoryView
} from './panels/HistoryPanel/viewState'
export { PanelLayout } from './components/PanelLayout/PanelLayout'
export { PanelFrame } from './components/PanelFrame/PanelFrame'
export { PanelHost } from './components/PanelHost/PanelHost'
export { CenterFileTabsSync } from './components/CenterFileTabsSync/CenterFileTabsSync'
export { TabContentView } from './components/TabContentView/TabContentView'
export { ResizeHandle } from './components/ResizeHandle/ResizeHandle'
export { PANEL_REGISTRY, getPanel, preloadPanel, preloadAllPanels, isPanelLoaded } from './registry'
export { LayoutShortcuts } from './LayoutShortcuts'
export type { PanelId, SlotId, PanelEntry } from './types'
export { LayoutCommandsBridge } from './CommandsBridge'
export {
  openPanelTab,
  openTerminalTab,
  openNewTerminalTab,
  closeTabSmart,
  activateTabSmart,
  toggleSlotPanel,
  reconcileFileTabs
} from './actions'
export { SLOT_IDS } from './persistence'
