// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Rutas de los binarios nativos (puro, testeable).
 *
 * NUNCA se incluye `process.cwd()`: un repositorio abierto desde la terminal
 * podría traer `native/search/*.node` o `native/kolargrep/…` y el simple hecho
 * de arrancar el IDE desde esa carpeta ejecutaría su código con privilegios
 * del usuario. Solo se mira la instalación de la app y su checkout de
 * desarrollo (que cuelga de `__dirname`, no del directorio de trabajo).
 */

import * as path from 'path'

/** Directorios donde buscar el addon NAPI de búsqueda. */
export function nativeSearchDirs(here: string): string[] {
  const unpacked = here.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
  return [
    here,
    ...(unpacked === here ? [] : [unpacked]),
    // Checkout de desarrollo: out/main/../../native/search.
    path.join(here, '../../native/search')
  ]
}

/** Directorios donde buscar el sidecar `kolargrep`. */
export function kolargrepDirs(here: string, resourcesPath?: string): string[] {
  const unpacked = here.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
  return [
    ...(resourcesPath ? [resourcesPath] : []),
    unpacked,
    here,
    path.join(here, '../../native/kolargrep/target/release')
  ]
}
