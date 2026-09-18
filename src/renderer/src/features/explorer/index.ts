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
