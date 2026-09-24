// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * API global de `.scrakk` — barrel del proceso main.
 *
 * Cualquier subsistema importa desde acá (`@main/scrakk` internamente) en vez
 * de resolver rutas por su cuenta. La capa de config por JSON en capas sigue
 * en `../scrakkFolder` (compartida con el LSP).
 */

export { registerScrakkIpc } from './ipc'
export {
  rootsOf,
  listEntries,
  readText,
  readJson,
  writeText,
  writeJson,
  removeEntry,
  makeDir,
  entryExists,
  statEntry,
  watchDir,
  unwatchDir,
  disposeWatchersFor
} from './fs'
