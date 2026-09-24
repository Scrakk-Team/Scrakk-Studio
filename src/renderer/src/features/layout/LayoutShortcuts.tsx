// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Atajos globales del layout.
 *
 * Los toggles de paneles (explorador mod+b, chat mod+j, historial
 * mod+alt+h) viven ahora como COMANDOS con keybinding propio en
 * `CommandsBridge` → el registry los registra en el sistema global de
 * atajos automáticamente. Este componente queda para futuros atajos que
 * no sean comandos.
 */

import type { JSX } from 'react'

export function LayoutShortcuts(): JSX.Element | null {
  return null
}
