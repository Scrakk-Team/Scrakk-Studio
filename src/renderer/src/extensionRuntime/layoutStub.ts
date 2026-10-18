// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Stub de `@features/layout` para paneles aislados.
 *
 * Un panel dentro del iframe NO puede compartir el layout del IDE (otro
 * origen). Los hooks devuelven no-ops y los componentes un placeholder; una
 * extensión que dependa del chrome del IDE debe migrar a una contribución
 * `views` (webview). Así el bundle igual carga en vez de morir con
 * "does not provide an export named ...".
 */

export function useLayout(): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get: () => () => undefined
    }
  )
}

export function usePanelTitle(): { setTitle: (value: string) => void } {
  return { setTitle: () => undefined }
}

export function usePanelTitleValue(): string {
  return ''
}

export function usePanelTitleOptional(): { setTitle: (value: string) => void } {
  return { setTitle: () => undefined }
}

export const HeaderActionButton = (): null => null
export const PanelLayout = (): null => null
export const PanelFrame = (): null => null
export const PanelHost = (): null => null
export const LayoutProvider = ({ children }: { children?: unknown }): unknown => children

export const openPanelTab = (): void => undefined
export const openTerminalTab = (): void => undefined
export const openNewTerminalTab = (): void => undefined
export const closeTabSmart = (): void => undefined
export const activateTabSmart = (): void => undefined
export const toggleSlotPanel = (): void => undefined
export const reconcileFileTabs = (): void => undefined
export const orderHeaderActions = (): void => undefined
export const moveHeaderAction = (): void => undefined
export const resetHeaderActions = (): void => undefined
export const snapshotHeaderActions = (): unknown => []
export const restoreHeaderActions = (): void => undefined
export const subscribeToHeaderActions = (): (() => void) => () => undefined
export const isHistoryViewOpen = (): boolean => false
export const setHistoryViewOpen = (): void => undefined
export const toggleHistoryView = (): void => undefined
export const subscribeToHistoryView = (): (() => void) => () => undefined
export const isSkillsViewOpen = (): boolean => false
export const setSkillsViewOpen = (): void => undefined
export const toggleSkillsView = (): void => undefined
export const subscribeToSkillsView = (): (() => void) => () => undefined
export const SLOT_IDS = [] as const
export const PANEL_REGISTRY = {}
export const getPanel = (): undefined => undefined
export const preloadPanel = (): void => undefined
export const preloadAllPanels = (): void => undefined
export const isPanelLoaded = (): boolean => false
export const LayoutShortcuts = (): null => null
export const LayoutCommandsBridge = (): null => null
export const CenterFileTabsSync = (): null => null
export const TabContentView = (): null => null
export const ResizeHandle = (): null => null
