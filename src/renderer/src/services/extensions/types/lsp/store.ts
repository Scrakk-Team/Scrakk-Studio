// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo de extensión 'lspServers' — estado persistido.
 *
 * No hay preferencias propias: el registro es efímero y se re-aplica en
 * cada boot de extensiones (mismo modelo que los paneles). El espacio queda
 * reservado para enabled/disabled por server cuando haga falta.
 */

export interface LspExtensionState {
  /** Servers deshabilitados por el usuario (ids). */
  disabled: string[]
}

const EMPTY_STATE: LspExtensionState = { disabled: [] }

export function getLspExtensionState(): LspExtensionState {
  return { ...EMPTY_STATE }
}
