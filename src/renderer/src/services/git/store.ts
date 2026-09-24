// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Git — store central por repo (multi-repo: Map<root, RepoState>).
 *
 * La app y las extensiones usan ESTA MISMA API. Patrón del repo:
 * Map + Set<Listener> + emit(). Refresh ante workspace-changed, watcher FS
 * y post-mutación. Mutaciones con notify() de éxito/error.
 */

import { gitApi } from './api'
import { notify } from '@services/notifications'
import type {
  AuthDetectResult,
  DeletedBranch,
  GhAuthStatus,
  GitBranch,
  GitCommit,
  GitFileChange,
  GitRemote,
  GitRepoInfo,
  GitResult,
  GitStash,
  GitTag,
  PullRequest,
  ReflogEntry
} from '@shared/git'

export interface RepoState {
  root: string
  toplevel: string
  loading: boolean
  error: string | null
  branch: string | null
  ahead: number | null
  behind: number | null
  upstream: string | null
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: GitFileChange[]
  branches: GitBranch[]
  remotes: GitRemote[]
  log: GitCommit[]
  logRef: string
  deletedBranches: DeletedBranch[]
  reflog: ReflogEntry[]
  stashes: GitStash[]
  tags: GitTag[]
  prs: PullRequest[]
  lastRefresh: number
}

export interface AuthState {
  loading: boolean
  detected: AuthDetectResult | null
  gh: GhAuthStatus | null
  error: string | null
  lastRefresh: number
}

type Listener = () => void

const repos = new Map<string, RepoState>()
let activeRoot: string | null = null
const listeners = new Set<Listener>()
const refreshing = new Set<string>()

const authState: AuthState = { loading: false, detected: null, gh: null, error: null, lastRefresh: 0 }

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

export function subscribeToGit(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function blankState(root: string, toplevel: string): RepoState {
  return {
    root,
    toplevel,
    loading: false,
    error: null,
    branch: null,
    ahead: null,
    behind: null,
    upstream: null,
    staged: [],
    unstaged: [],
    untracked: [],
    branches: [],
    remotes: [],
    log: [],
    logRef: 'HEAD',
    deletedBranches: [],
    reflog: [],
    stashes: [],
    tags: [],
    prs: [],
    lastRefresh: 0
  }
}

export function listRepos(): RepoState[] {
  return [...repos.values()]
}

export function getActiveRoot(): string | null {
  return activeRoot
}

export function getRepoState(root?: string): RepoState | null {
  const key = root ?? activeRoot
  if (!key) return null
  return repos.get(key) ?? null
}

export function getAuthState(): AuthState {
  return authState
}

export function setActiveRoot(root: string | null): void {
  if (root !== null && !repos.has(root)) return
  if (activeRoot === root) return
  activeRoot = root
  emit()
  if (root) void refreshRepo(root)
}

/** Detecta repos bajo el workspace y deja el activo listo. */
export async function detectRepos(workspaceRoot: string): Promise<GitRepoInfo[]> {
  const res = await gitApi.detectRepos({ root: workspaceRoot })
  if (!res.ok) {
    return []
  }
  const known = new Set(repos.keys())
  for (const info of res.data) {
    if (!repos.has(info.toplevel)) {
      repos.set(info.toplevel, blankState(info.toplevel, info.toplevel))
    }
    known.delete(info.toplevel)
  }
  // Limpia repos que ya no existen (misma sesión).
  for (const gone of known) repos.delete(gone)
  if (!activeRoot || !repos.has(activeRoot)) {
    activeRoot = repos.has(workspaceRoot)
      ? workspaceRoot
      : ([...repos.keys()][0] ?? null)
  }
  emit()
  if (activeRoot) void refreshRepo(activeRoot)
  return res.data
}

function unwrap<T>(res: GitResult<T>, fallback: T): { value: T; error: string | null } {
  if (res.ok) return { value: res.data, error: null }
  return { value: fallback, error: `${res.error.code}: ${res.error.message}` }
}

/** Refresh núcleo (rápido): status + branches + remotes. */
export async function refreshRepo(root: string): Promise<void> {
  const state = repos.get(root)
  if (!state || refreshing.has(`core:${root}`)) return
  refreshing.add(`core:${root}`)
  state.loading = true
  emit()
  try {
    const [statusRes, branchesRes, remotesRes] = await Promise.all([
      gitApi.status({ cwd: root }),
      gitApi.branches({ cwd: root }),
      gitApi.remotes({ cwd: root })
    ])
    if (!statusRes.ok && statusRes.error.code === 'not-a-repo') {
      repos.delete(root)
      if (activeRoot === root) activeRoot = [...repos.keys()][0] ?? null
      emit()
      return
    }
    const status = unwrap(statusRes, null)
    const branches = unwrap(branchesRes, [])
    const remotes = unwrap(remotesRes, [])
    if (status.value) {
      state.branch = status.value.branch
      state.ahead = status.value.ahead
      state.behind = status.value.behind
      state.upstream = status.value.upstream
      state.staged = status.value.staged
      state.unstaged = status.value.unstaged
      state.untracked = status.value.untracked
    }
    state.branches = branches.value
    state.remotes = remotes.value
    state.error = status.error ?? branches.error ?? remotes.error
    state.lastRefresh = Date.now()
  } finally {
    refreshing.delete(`core:${root}`)
    const current = repos.get(root)
    if (current) current.loading = false
    emit()
  }
}

/** Refresh pesado (panel visible): log + reflog + stash + tags + PRs. */
export async function refreshRepoFull(root: string, logRef?: string): Promise<void> {
  await refreshRepo(root)
  const state = repos.get(root)
  if (!state || refreshing.has(`full:${root}`)) return
  refreshing.add(`full:${root}`)
  try {
    const ref = logRef ?? state.branch ?? 'HEAD'
    state.logRef = ref
    const [logRes, reflogRes, stashRes, tagsRes] = await Promise.all([
      gitApi.log({ cwd: root, ref, limit: 200 }),
      gitApi.reflog({ cwd: root, limit: 100 }),
      gitApi.stashList({ cwd: root }),
      gitApi.tags({ cwd: root })
    ])
    const log = unwrap(logRes, [])
    const reflog = unwrap(reflogRes, { entries: [], deleted: [] })
    const stash = unwrap(stashRes, [])
    const tags = unwrap(tagsRes, [])
    state.log = log.value
    state.reflog = reflog.value.entries
    // Excluye branches que existen ahora (restauradas o aún vivas).
    const alive = new Set(state.branches.map((b) => b.name))
    state.deletedBranches = reflog.value.deleted.filter((d) => !alive.has(d.name))
    state.stashes = stash.value
    state.tags = tags.value
    if (log.error) state.error = log.error
    state.lastRefresh = Date.now()
  } finally {
    refreshing.delete(`full:${root}`)
    emit()
  }
  void refreshPrs(root)
}

export async function refreshPrs(root: string): Promise<void> {
  const state = repos.get(root)
  if (!state) return
  const res = await gitApi.ghPrList({ cwd: root, limit: 30, state: 'open' })
  if (res.ok) {
    state.prs = res.data
    emit()
  }
}

export async function refreshAuth(): Promise<void> {
  if (authState.loading) return
  authState.loading = true
  authState.error = null
  emit()
  try {
    const res = await gitApi.authDetect()
    if (res.ok) {
      authState.detected = res.data
      authState.gh = {
        available: res.data.ghAvailable,
        loggedIn: res.data.ghLoggedIn,
        user: res.data.ghUser,
        hosts: []
      }
    } else {
      authState.error = res.error.message
    }
    authState.lastRefresh = Date.now()
  } finally {
    authState.loading = false
    emit()
  }
}

type Mutation<T> = (root: string, args: T) => Promise<GitResult<unknown>>

async function mutate<T>(
  root: string,
  label: string,
  fn: Mutation<T>,
  args?: T,
  opts?: { full?: boolean; silent?: boolean }
): Promise<boolean> {
  const res = await fn(root, args as T)
  if (!res.ok) {
    notify({ title: `Git: ${label}`, message: res.error.message, severity: 'error' })
    const state = repos.get(root)
    if (state) {
      state.error = res.error.message
      emit()
    }
    return false
  }
  if (!opts?.silent) notify({ title: `Git: ${label}`, severity: 'success' })
  if (opts?.full) void refreshRepoFull(root)
  else void refreshRepo(root)
  return true
}

// ── Mutaciones (todas refrescan + notifican) ──────────────────────────────

export const stagePaths = (root: string, paths: string[]): Promise<boolean> =>
  mutate(root, 'stage', (r, p) => gitApi.stage({ cwd: r, paths: p }), paths)

export const unstagePaths = (root: string, paths: string[]): Promise<boolean> =>
  mutate(root, 'unstage', (r, p) => gitApi.unstage({ cwd: r, paths: p }), paths)

export const discardPaths = (root: string, paths: string[]): Promise<boolean> =>
  mutate(root, 'descartar', (r, p) => gitApi.discard({ cwd: r, paths: p }), paths, { silent: true })

export const commitChanges = (root: string, message: string, opts?: { amend?: boolean; stageAll?: boolean }): Promise<boolean> =>
  mutate(root, 'commit', (r, a) => gitApi.commit({ cwd: r, message: a.message, amend: a.amend, stageAll: a.stageAll }), { message, ...opts }, { full: true })

export const checkoutRef = (root: string, ref: string): Promise<boolean> =>
  mutate(root, `checkout ${ref}`, (r, p) => gitApi.checkout({ cwd: r, ref: p }), ref, { full: true })

export const createBranch = (root: string, name: string, startPoint?: string): Promise<boolean> =>
  mutate(root, `rama ${name}`, (r, a) => gitApi.branchCreate({ cwd: r, name: a.name, startPoint: a.startPoint }), { name, startPoint }, { full: true })

export const deleteBranch = (root: string, name: string, force?: boolean): Promise<boolean> =>
  mutate(root, `eliminar ${name}`, (r, a) => gitApi.branchDelete({ cwd: r, name: a.name, force: a.force }), { name, force }, { full: true })

export const renameBranch = (root: string, oldName: string, newName: string): Promise<boolean> =>
  mutate(root, 'renombrar rama', (r, a) => gitApi.branchRename({ cwd: r, oldName: a.oldName, newName: a.newName }), { oldName, newName }, { full: true })

export const pushRepo = (root: string, opts?: { setUpstream?: boolean }): Promise<boolean> =>
  mutate(root, 'push', (r, a) => gitApi.push({ cwd: r, setUpstream: a.setUpstream }), { setUpstream: opts?.setUpstream }, { full: true })

export const pullRepo = (root: string): Promise<boolean> =>
  mutate(root, 'pull', (r) => gitApi.pull({ cwd: r }), undefined, { full: true })

export const fetchRepo = (root: string): Promise<boolean> =>
  mutate(root, 'fetch', (r) => gitApi.fetch({ cwd: r, prune: true }), undefined, { full: true })

export const addRemote = (root: string, name: string, url: string): Promise<boolean> =>
  mutate(root, `remoto ${name}`, (r, a) => gitApi.remoteAdd({ cwd: r, name: a.name, url: a.url }), { name, url })

export const removeRemote = (root: string, name: string): Promise<boolean> =>
  mutate(root, `quitar ${name}`, (r, a) => gitApi.remoteRemove({ cwd: r, name: a }), name)

export const stashSave = (root: string, message?: string, includeUntracked?: boolean): Promise<boolean> =>
  mutate(root, 'stash', (r, a) => gitApi.stashPush({ cwd: r, message: a.message, includeUntracked: a.includeUntracked }), { message, includeUntracked }, { full: true })

export const stashPop = (root: string, index?: number): Promise<boolean> =>
  mutate(root, 'stash pop', (r, a) => gitApi.stashPop({ cwd: r, index: a }), index, { full: true })

export const stashApply = (root: string, index?: number): Promise<boolean> =>
  mutate(root, 'stash apply', (r, a) => gitApi.stashApply({ cwd: r, index: a }), index, { full: true })

export const stashDrop = (root: string, index: number): Promise<boolean> =>
  mutate(root, 'stash drop', (r, a) => gitApi.stashDrop({ cwd: r, index: a }), index, { full: true })

export const createTag = (root: string, name: string, message?: string): Promise<boolean> =>
  mutate(root, `tag ${name}`, (r, a) => gitApi.tagCreate({ cwd: r, name: a.name, message: a.message }), { name, message }, { full: true })

export const deleteTag = (root: string, name: string): Promise<boolean> =>
  mutate(root, `quitar tag ${name}`, (r, a) => gitApi.tagDelete({ cwd: r, name: a }), name, { full: true })

export const cherryPickCommit = (root: string, sha: string): Promise<boolean> =>
  mutate(root, 'cherry-pick', (r, a) => gitApi.cherryPick({ cwd: r, sha: a }), sha, { full: true })

export const revertCommit = (root: string, sha: string): Promise<boolean> =>
  mutate(root, 'revert', (r, a) => gitApi.revert({ cwd: r, sha: a }), sha, { full: true })

export const resetRepo = (root: string, mode: 'soft' | 'mixed' | 'hard', ref: string): Promise<boolean> =>
  mutate(root, 'reset', (r, a) => gitApi.reset({ cwd: r, mode: a.mode, ref: a.ref }), { mode, ref }, { full: true })

export const initRepo = (root: string): Promise<boolean> =>
  mutate(root, 'init', (r) => gitApi.init({ cwd: r }), undefined, { full: true })

export const createPr = async (
  root: string,
  input: { title: string; body?: string; base?: string; head?: string; draft?: boolean }
): Promise<boolean> => {
  const res = await gitApi.ghPrCreate({ cwd: root, ...input })
  if (!res.ok) {
    notify({ title: 'Git: crear PR', message: res.error.message, severity: 'error' })
    return false
  }
  notify({ title: 'Git: PR creado', message: res.data.url, severity: 'success' })
  void refreshPrs(root)
  return true
}

export const mergePr = async (root: string, number: number, method?: 'merge' | 'squash' | 'rebase'): Promise<boolean> => {
  const res = await gitApi.ghPrMerge({ cwd: root, number, method })
  if (!res.ok) {
    notify({ title: 'Git: merge PR', message: res.error.message, severity: 'error' })
    return false
  }
  notify({ title: 'Git: PR mergeado', severity: 'success' })
  void refreshPrs(root)
  void refreshRepoFull(root)
  return true
}

/** Solo tests: resetea stores. */
export function _resetGitForTests(): void {
  repos.clear()
  activeRoot = null
  refreshing.clear()
  listeners.clear()
  authState.loading = false
  authState.detected = null
  authState.gh = null
  authState.error = null
  authState.lastRefresh = 0
}
