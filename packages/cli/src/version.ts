// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Versionado — espejo mínimo de `src/shared/version.ts` del IDE.
 *
 * El paquete publicado es independiente del repo, así que la utilidad viaja
 * embebida (en vez de importar fuera del paquete) y mantiene el mismo criterio:
 * semver-lite, major.minor.patch, sufijos ignorados.
 */

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
}

/** Parsea 'v0.2.1-beta' → { 0, 2, 1 }. Inválido → null. */
export function parseVersion(raw: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(raw ?? '').trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
}
