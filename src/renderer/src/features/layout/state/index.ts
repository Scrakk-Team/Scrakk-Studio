// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

export { LayoutProvider, useLayout } from './LayoutContext'
export type { LayoutSlots } from './LayoutContext'
export {
  PanelTitleProvider,
  PanelTitleAutoProvider,
  usePanelTitle,
  usePanelTitleValue,
  usePanelTitleOptional
} from './PanelTitleContext'
export {
  orderHeaderActions,
  moveHeaderAction,
  resetHeaderActions,
  snapshotHeaderActions,
  restoreHeaderActions,
  subscribeToHeaderActions
} from './headerActions'
export type { HeaderActionLike } from './headerActions'
