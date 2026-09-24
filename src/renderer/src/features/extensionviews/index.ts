// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Vistas de extensiones — paneles de la activity bar aportados por
 * extensiones que ejecutan código (Extension Host).
 */

export { ExtensionViewPanel } from './ExtensionViewPanel'
export { getHostBridge } from './panelBridge'
export {
  VIEW_PANEL_PREFIX,
  parseViewPanelId,
  readHostMode,
  setHostMode,
  viewButtonId,
  viewPanelId
} from './ids'
