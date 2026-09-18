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
