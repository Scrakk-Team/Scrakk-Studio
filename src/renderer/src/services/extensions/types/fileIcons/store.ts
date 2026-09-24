// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'fileIcons' — store: re-exporta la persistencia del servicio global.
 * La verdad vive en services/fileIcons/store.ts (localStorage
 * 'scrakk:active-file-icon-theme'); aquí solo se re-exporta para la
 * convención types/<kind>/store.ts.
 */

export {
  loadStoredActiveTheme,
  saveStoredActiveTheme,
  clearStoredActiveTheme
} from '@services/fileIcons/store'
