// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Modo del `fs:search-in-files`: la query es **literal por defecto**, salvo
 * `regex: true`. Los backends regex (kolargrep / addon nativo) reciben el
 * patrón ESCAPADO en modo literal, para que busquen el texto exacto y no
 * interpreten `chr(10)` como `chr` + grupo `10`.
 */

/** Escapa los metacaracteres de regex para buscar el texto tal cual. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
