// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Feature Explorer — panel de archivos del workspace.
 * Módulo autocontenido: hooks, componentes y estilos propios.
 */

export { ExplorerPanel } from './ExplorerPanel'
export { setWorkspaceRoot } from './hooks/useWorkspaceState'
export { ExplorerView } from './ExplorerView'
export {
  registerFileDecorationProvider,
  getFileDecoration,
  refreshFileDecorations,
  subscribeToDecorations,
  isGitDecorationsVisible,
  setGitDecorationsVisible,
  type FileDecoration,
  type FileDecorationProvider
} from './decorations'
export { ancestorDirs, filterRowsByPaths } from './filter'
