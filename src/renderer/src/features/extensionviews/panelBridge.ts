// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Acceso al puente nativo del Extension Host desde el renderer.
 *
 * Evita que cada componente repita el chequeo de "¿hay puente?" (en un build
 * web `window.api` no existe) y centraliza los helpers de identidad de panel.
 */

import type { ExtensionHostApi } from '@shared/extensions'

/** El API del host, o null si no hay puente nativo (build web / tests). */
export function getHostBridge(): ExtensionHostApi | null {
  return globalThis.window?.api?.extensions?.host ?? null
}

export {
  parseViewPanelId,
  parseWebviewPanelId,
  readHostMode,
  setHostMode,
  viewButtonId,
  viewPanelId,
  webviewPanelId
} from './ids'
