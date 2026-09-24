// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Ancla del input de chat activo.
 *
 * La confirmación de tools se muestra como panel anclado ARRIBA del input
 * (igual que el autocompletado de comandos). El input publica cómo obtener su
 * rect y la confirmación lo consulta. Si no hay input montado, la confirmación
 * cae al modal centrado de siempre.
 */

let provider: (() => DOMRect | null) | null = null

/** Registra (o limpia con null) el proveedor del rect del input. */
export function registerChatInputAnchor(next: (() => DOMRect | null) | null): void {
  provider = next
}

/** Rect actual del input, o null si no hay ninguno montado. */
export function getChatInputAnchor(): DOMRect | null {
  try {
    return provider?.() ?? null
  } catch {
    return null
  }
}
