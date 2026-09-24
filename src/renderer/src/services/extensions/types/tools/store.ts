// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'tools' — estado/bajas. No hay preferencias propias: el enable/disable
 * lo maneja `toolSettingsService` (mismo que las tools built-in), así que acá
 * solo vive el desregistro al desinstalar la extensión.
 */

import { registry } from '@services/ai/tools'
import type { RegisteredToolRef } from './logic'

export function unregisterTools(owned: RegisteredToolRef[]): void {
  for (const ref of owned) {
    registry.unregister(ref.name)
  }
}
