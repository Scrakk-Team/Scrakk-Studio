// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Git — API pública (servicio singleton + parsers compartidos).
 */

export { gitApi } from './api'
export { gitFileDecoration, toRepoRel } from './decorations'
export {
  subscribeToGit,
  listRepos,
  getActiveRoot,
  getRepoState,
  getAuthState,
  setActiveRoot,
  detectRepos,
  refreshRepo,
  refreshRepoFull,
  refreshPrs,
  refreshAuth,
  stagePaths,
  unstagePaths,
  discardPaths,
  commitChanges,
  checkoutRef,
  createBranch,
  deleteBranch,
  renameBranch,
  pushRepo,
  pullRepo,
  fetchRepo,
  addRemote,
  removeRemote,
  stashSave,
  stashPop,
  stashApply,
  stashDrop,
  createTag,
  deleteTag,
  cherryPickCommit,
  revertCommit,
  resetRepo,
  initRepo,
  createPr,
  mergePr,
  _resetGitForTests,
  type RepoState,
  type AuthState
} from './store'
