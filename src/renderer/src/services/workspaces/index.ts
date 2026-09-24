// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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
