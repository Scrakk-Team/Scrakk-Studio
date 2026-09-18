/**
 * Workspaces — API pública del historial de proyectos.
 */

export {
  baseNameOf,
  listWorkspaces,
  getActiveWorkspace,
  subscribeToWorkspaces,
  recordWorkspace,
  prevWorkspace,
  nextWorkspace,
  _resetWorkspacesForTests,
  type WorkspacesListener
} from './history'
