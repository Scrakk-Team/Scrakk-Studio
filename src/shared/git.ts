// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Módulo compartido (main + preload + renderer): git real vía IPC.
 *
 * Un único lugar define los canales y la forma de la API. El renderer NUNCA
 * arma argv: cada operación es un handler con argv fijo construido en main
 * (whitelist). Los tokens viajan por stdin, jamás en argv ni en logs.
 */

export const GIT_IPC = {
  version: 'git:version',
  detectRepos: 'git:detect-repos',
  status: 'git:status',
  log: 'git:log',
  branches: 'git:branches',
  reflog: 'git:reflog',
  diffNumstat: 'git:diff-numstat',
  showCommit: 'git:show-commit',
  stage: 'git:stage',
  unstage: 'git:unstage',
  discard: 'git:discard',
  commit: 'git:commit',
  checkout: 'git:checkout',
  branchCreate: 'git:branch-create',
  branchDelete: 'git:branch-delete',
  branchRename: 'git:branch-rename',
  push: 'git:push',
  pull: 'git:pull',
  fetch: 'git:fetch',
  remotes: 'git:remotes',
  remoteAdd: 'git:remote-add',
  remoteRemove: 'git:remote-remove',
  stashList: 'git:stash-list',
  stashPush: 'git:stash-push',
  stashPop: 'git:stash-pop',
  stashApply: 'git:stash-apply',
  stashDrop: 'git:stash-drop',
  tags: 'git:tags',
  tagCreate: 'git:tag-create',
  tagDelete: 'git:tag-delete',
  cherryPick: 'git:cherry-pick',
  revert: 'git:revert',
  reset: 'git:reset',
  init: 'git:init',
  authDetect: 'git:auth-detect',
  authLoginGh: 'git:auth-login-gh',
  authLogoutGh: 'git:auth-logout-gh',
  authLoginHttps: 'git:auth-login-https',
  authValidate: 'git:auth-validate',
  sshProbe: 'git:ssh-probe',
  ghPrList: 'git:gh-pr-list',
  ghPrView: 'git:gh-pr-view',
  ghPrCreate: 'git:gh-pr-create',
  ghPrMerge: 'git:gh-pr-merge'
} as const

export type GitErrorCode =
  | 'no-binary'
  | 'not-a-repo'
  | 'auth'
  | 'timeout'
  | 'conflict'
  | 'invalid'
  | 'failed'

export interface GitError {
  code: GitErrorCode
  message: string
}

export type GitResult<T> = { ok: true; data: T } | { ok: false; error: GitError }

export interface GitFileChange {
  /** Ruta relativa al root del repo. */
  path: string
  /** Estado porcelain XY (ej. 'M ', ' M', '??', 'A ', 'D ', 'R '). */
  xy: string
  /** Origen si es renombre. */
  origPath?: string
}

export interface GitStatus {
  branch: string | null
  /** null = sin upstream / no aplica. */
  ahead: number | null
  behind: number | null
  upstream: string | null
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: GitFileChange[]
}

export interface GitCommit {
  sha: string
  shortSha: string
  author: string
  email: string
  date: string
  message: string
  fullMessage: string
  refs: string[]
}

export interface GitBranch {
  /** Nombre corto (local) o remoto completo (origin/main). */
  name: string
  remote: string | null
  current: boolean
  upstream: string | null
  /** 'ahead 2, behind 1' de --trackshort, o null. */
  track: string | null
  sha: string
  date: string
}

export interface ReflogEntry {
  sha: string
  action: string
  ref: string
  date: string
}

export interface DeletedBranch {
  name: string
  sha: string
  date: string
}

export interface GitRemote {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface GitStash {
  index: number
  message: string
  branch: string
}

export interface GitTag {
  name: string
  date: string
}

export interface GitRepoInfo {
  root: string
  toplevel: string
}

export interface PrCheck {
  name: string
  status: string
  conclusion: string
}

export interface PullRequest {
  number: number
  title: string
  body: string
  url: string
  state: string
  isDraft: boolean
  headRef: string
  baseRef: string
  author: string
  checks: PrCheck[]
  updatedAt: string
}

export interface GhAuthStatus {
  available: boolean
  loggedIn: boolean
  user: string | null
  hosts: string[]
}

export interface AuthDetectResult {
  ghAvailable: boolean
  ghLoggedIn: boolean
  ghUser: string | null
  credentialHelper: string | null
  sshGithubOk: boolean | null
}

export interface GitApi {
  version: () => Promise<GitResult<string>>
  detectRepos: (req: { root: string; maxDepth?: number }) => Promise<GitResult<GitRepoInfo[]>>
  status: (req: { cwd: string }) => Promise<GitResult<GitStatus>>
  log: (req: { cwd: string; ref?: string; limit?: number }) => Promise<GitResult<GitCommit[]>>
  branches: (req: { cwd: string }) => Promise<GitResult<GitBranch[]>>
  reflog: (req: { cwd: string; limit?: number }) => Promise<GitResult<{ entries: ReflogEntry[]; deleted: DeletedBranch[] }>>
  diffNumstat: (req: { cwd: string; ref?: string; staged?: boolean }) => Promise<GitResult<Array<{ path: string; added: number; removed: number }>>>
  showCommit: (req: { cwd: string; sha: string }) => Promise<GitResult<GitCommit & { files: Array<{ path: string; status: string }> }>>
  stage: (req: { cwd: string; paths: string[] }) => Promise<GitResult<null>>
  unstage: (req: { cwd: string; paths: string[] }) => Promise<GitResult<null>>
  discard: (req: { cwd: string; paths: string[] }) => Promise<GitResult<null>>
  commit: (req: { cwd: string; message: string; amend?: boolean; stageAll?: boolean }) => Promise<GitResult<string>>
  checkout: (req: { cwd: string; ref: string; create?: boolean }) => Promise<GitResult<null>>
  branchCreate: (req: { cwd: string; name: string; startPoint?: string }) => Promise<GitResult<null>>
  branchDelete: (req: { cwd: string; name: string; force?: boolean }) => Promise<GitResult<null>>
  branchRename: (req: { cwd: string; oldName: string; newName: string }) => Promise<GitResult<null>>
  push: (req: { cwd: string; remote?: string; branch?: string; setUpstream?: boolean }) => Promise<GitResult<string>>
  pull: (req: { cwd: string; remote?: string; branch?: string }) => Promise<GitResult<string>>
  fetch: (req: { cwd: string; prune?: boolean }) => Promise<GitResult<string>>
  remotes: (req: { cwd: string }) => Promise<GitResult<GitRemote[]>>
  remoteAdd: (req: { cwd: string; name: string; url: string }) => Promise<GitResult<null>>
  remoteRemove: (req: { cwd: string; name: string }) => Promise<GitResult<null>>
  stashList: (req: { cwd: string }) => Promise<GitResult<GitStash[]>>
  stashPush: (req: { cwd: string; message?: string; includeUntracked?: boolean }) => Promise<GitResult<string>>
  stashPop: (req: { cwd: string; index?: number }) => Promise<GitResult<string>>
  stashApply: (req: { cwd: string; index?: number }) => Promise<GitResult<string>>
  stashDrop: (req: { cwd: string; index: number }) => Promise<GitResult<null>>
  tags: (req: { cwd: string }) => Promise<GitResult<GitTag[]>>
  tagCreate: (req: { cwd: string; name: string; message?: string }) => Promise<GitResult<null>>
  tagDelete: (req: { cwd: string; name: string }) => Promise<GitResult<null>>
  cherryPick: (req: { cwd: string; sha: string }) => Promise<GitResult<string>>
  revert: (req: { cwd: string; sha: string }) => Promise<GitResult<string>>
  reset: (req: { cwd: string; mode: 'soft' | 'mixed' | 'hard'; ref: string }) => Promise<GitResult<null>>
  init: (req: { cwd: string }) => Promise<GitResult<null>>
  authDetect: () => Promise<GitResult<AuthDetectResult>>
  authLoginGh: (req: { token: string; host?: string }) => Promise<GitResult<GhAuthStatus>>
  authLogoutGh: (req: { host?: string }) => Promise<GitResult<null>>
  authLoginHttps: (req: { host: string; username: string; token: string }) => Promise<GitResult<null>>
  authValidate: (req: { cwd: string; url?: string }) => Promise<GitResult<string>>
  sshProbe: (req: { host: string }) => Promise<GitResult<boolean>>
  ghPrList: (req: { cwd: string; limit?: number; state?: string }) => Promise<GitResult<PullRequest[]>>
  ghPrView: (req: { cwd: string; number: number }) => Promise<GitResult<PullRequest>>
  ghPrCreate: (req: { cwd: string; title: string; body?: string; base?: string; head?: string; draft?: boolean }) => Promise<GitResult<PullRequest>>
  ghPrMerge: (req: { cwd: string; number: number; method?: 'merge' | 'squash' | 'rebase' }) => Promise<GitResult<string>>
}
