// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'notifications' — estado persistido (reservado).
 */

export interface NotificationsExtensionState {
  /** Esquina preferida declarada por el usuario. */
  defaultCorner?: 'tl' | 'tr' | 'bl' | 'br'
}
