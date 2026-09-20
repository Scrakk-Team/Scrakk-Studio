import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { HeaderActionButton, usePanelTitle } from '@features/layout'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import {
  ExplorerView,
  refreshFileDecorations,
  isGitDecorationsVisible,
  setGitDecorationsVisible
} from '@features/explorer'
import { pickOption } from '@services/modals'
import { notify } from '@services/notifications'
import { gitApi } from '@services/git/api'
import {
  subscribeToGit,
  listRepos,
  getActiveRoot,
  getRepoState,
  getAuthState,
  setActiveRoot,
  detectRepos,
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
  type RepoState
} from '@services/git'
import type { GitBranch, GitFileChange } from '@shared/git'
import type { ShownCommit } from '@shared/git-parse'
import type { PullRequest } from '@shared/git'
import styles from './GitPanel.module.css'

const ROOT_KEY = 'scrakk-studio:root-path'

function useWorkspaceRoot(): string | null {
  const [root, setRoot] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ROOT_KEY)
    } catch {
      return null
    }
  })
  useEffect(() => {
    const onChange = (event: Event): void => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path
      if (path) setRoot(path)
    }
    window.addEventListener('workspace-changed', onChange)
    return () => window.removeEventListener('workspace-changed', onChange)
  }, [])
  return root
}

function useGitTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => subscribeToGit(() => setTick((t) => t + 1)), [])
  return tick
}

function baseNameOf(path: string): string {
  const clean = path.replace(/[/\\]+$/, '')
  return clean.slice(Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\')) + 1) || clean
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
}

async function confirmDanger(title: string, confirmLabel: string): Promise<boolean> {
  const picked = await pickOption(title, [
    { id: 'cancel', label: 'Cancelar' },
    { id: 'yes', label: confirmLabel, danger: true, separatorBefore: true }
  ])
  return picked === 'yes'
}

function copyText(text: string, label: string): void {
  try {
    const clip = navigator.clipboard
    if (clip?.writeText) {
      clip
        .writeText(text)
        .then(() => notify({ title: label, severity: 'success' }))
        .catch(() => notify({ title: label, message: 'No se pudo copiar', severity: 'error' }))
    }
  } catch {
    notify({ title: label, message: 'No se pudo copiar', severity: 'error' })
  }
}

/**
 * Panel de git REAL: cambios, sync, ramas, eliminadas, historial, stash,
 * tags, remotos, cuenta (auth con gh/HTTPS) y pull requests. Todo ejecuta
 * git/gh de verdad vía IPC; nada fake. Solo aporta contenido (el frame lo
 * maneja el sistema de layouts).
 */
export function GitPanel(): JSX.Element {
  const { setTitle, setActions } = usePanelTitle()
  const workspaceRoot = useWorkspaceRoot()
  const tick = useGitTick()
  void tick

  const [sections, setSections] = useState<Record<string, boolean>>({
    changes: true,
    files: false,
    branches: true,
    history: false,
    stash: false,
    tags: false,
    remotes: false,
    account: false,
    prs: false
  })
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [expandedSha, setExpandedSha] = useState<string | null>(null)
  const [commitDetail, setCommitDetail] = useState<Map<string, ShownCommit>>(new Map())
  const [logRef, setLogRef] = useState<string | null>(null)
  const [showStashForm, setShowStashForm] = useState(false)
  const [stashMessage, setStashMessage] = useState('')
  const [showTagForm, setShowTagForm] = useState(false)
  const [tagName, setTagName] = useState('')
  const [showRemoteForm, setShowRemoteForm] = useState(false)
  const [remoteName, setRemoteName] = useState('')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [showPrForm, setShowPrForm] = useState(false)
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [prBase, setPrBase] = useState('')
  const [expandedPr, setExpandedPr] = useState<number | null>(null)
  // Login (en el panel, no en modal): gh token o HTTPS genérico.
  const [loginMode, setLoginMode] = useState<'gh' | 'https'>('gh')
  const [loginHost, setLoginHost] = useState('')
  const [loginUser, setLoginUser] = useState('')
  const [loginToken, setLoginToken] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginMessage, setLoginMessage] = useState<string | null>(null)
  const [sshState, setSshState] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle')

  useEffect(() => {
    setTitle('Git')
  }, [setTitle])

  // Boot: detectar repos + refresh pesado + auth.
  useEffect(() => {
    if (!workspaceRoot) return
    void detectRepos(workspaceRoot).then(() => {
      const active = getActiveRoot()
      if (active) {
        void refreshRepoFull(active)
        void refreshAuth()
      }
    })
  }, [workspaceRoot])

  // Refresco liviano al volver el foco.
  useEffect(() => {
    const onFocus = (): void => {
      const active = getActiveRoot()
      if (active) void refreshRepoFull(active)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Las filas se re-renderizan cuando git cambia (vía este emit).
  useEffect(() => subscribeToGit(() => refreshFileDecorations()), [])

  const repos = useMemo(() => listRepos(), [tick])
  const activeRoot = getActiveRoot()
  const state: RepoState | null = activeRoot ? getRepoState(activeRoot) : null

  const toggleSection = useCallback((key: string): void => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const withRoot = useCallback(
    async (fn: (root: string) => Promise<unknown>): Promise<void> => {
      if (!activeRoot) return
      await fn(activeRoot)
    },
    [activeRoot]
  )

  // Header: refresh + nueva rama (como el + del chat). Arrastrables: el
  // usuario decide cuál queda primero.
  useEffect(() => {
    setActions(() => (
      <>
        <HeaderActionButton
          id="git.refresh"
          label="Actualizar"
          icon="refresh"
          size="sm"
          onClick={() => {
            const root = getActiveRoot()
            if (root) {
              void refreshRepoFull(root)
              void refreshAuth()
            }
          }}
        />
        <HeaderActionButton
          id="git.new-branch"
          label="Nueva rama"
          icon="plus"
          size="sm"
          onClick={() => setShowNewBranch((v) => !v)}
        />
      </>
    ))
    return () => setActions(null)
  }, [setActions])

  // Detalle de commit bajo demanda.
  useEffect(() => {
    if (!expandedSha || !activeRoot || commitDetail.has(expandedSha)) return
    void gitApi.showCommit({ cwd: activeRoot, sha: expandedSha }).then((res) => {
      if (res.ok) {
        setCommitDetail((prev) => new Map(prev).set(expandedSha, res.data))
      }
    })
  }, [expandedSha, activeRoot, commitDetail])

  const openRepoMenu = useCallback(
    (clientX: number, clientY: number): void => {
      showContextMenu(
        clientX,
        clientY,
        repos.map((repo) => ({
          label: `${baseNameOf(repo.toplevel)}${repo.root === activeRoot ? ' ✓' : ''}`,
          onClick: () => {
            setActiveRoot(repo.root)
            void refreshRepoFull(repo.root)
          }
        }))
      )
    },
    [repos, activeRoot]
  )

  const openBranchMenu = useCallback(
    (event: { clientX: number; clientY: number }, branch: GitBranch): void => {
      if (!activeRoot) return
      const root = activeRoot
      showContextMenu(event.clientX, event.clientY, [
        {
          label: 'Copiar SHA',
          onClick: () => copyText(branch.sha, 'SHA copiado')
        },
        {
          label: 'Renombrar…',
          separatorBefore: true,
          onClick: () => {
            const next = window.prompt('Nuevo nombre', branch.name)
            if (next && next !== branch.name) void renameBranch(root, branch.name, next)
          }
        },
        ...(branch.current
          ? []
          : [
              {
                label: `Eliminar ${branch.name}`,
                danger: true,
                onClick: () =>
                  void (async () => {
                    if (await confirmDanger(`Eliminar rama ${branch.name}`, 'Eliminar')) {
                      await deleteBranch(root, branch.name)
                    }
                  })()
              }
            ])
      ])
    },
    [activeRoot]
  )

  const checkoutBranch = useCallback(
    async (branch: GitBranch): Promise<void> => {
      if (!activeRoot || branch.current) return
      const root = activeRoot
      if (branch.remote) {
        // Remota: crear tracking local y entrar (git switch -c).
        const short = branch.name.includes('/') ? branch.name.slice(branch.name.indexOf('/') + 1) : branch.name
        const exists = getRepoState(root)?.branches.some((b) => !b.remote && b.name === short)
        if (exists) {
          await checkoutRef(root, short)
        } else {
          if (await createBranch(root, short, branch.name)) await checkoutRef(root, short)
        }
        return
      }
      await checkoutRef(root, branch.name)
    },
    [activeRoot]
  )

  const doSync = useCallback(
    async (kind: 'fetch' | 'pull' | 'push', pushUpstream?: boolean): Promise<void> => {
      if (!activeRoot) return
      setSyncing(kind)
      try {
        if (kind === 'fetch') await fetchRepo(activeRoot)
        else if (kind === 'pull') await pullRepo(activeRoot)
        else {
          const st = getRepoState(activeRoot)
          await pushRepo(activeRoot, { setUpstream: pushUpstream ?? !st?.upstream })
        }
      } finally {
        setSyncing(null)
      }
    },
    [activeRoot]
  )

  const doCommit = useCallback(
    async (stageAll: boolean): Promise<void> => {
      if (!activeRoot || !commitMessage.trim()) return
      setCommitting(true)
      try {
        if (await commitChanges(activeRoot, commitMessage.trim(), { stageAll })) {
          setCommitMessage('')
        }
      } finally {
        setCommitting(false)
      }
    },
    [activeRoot, commitMessage]
  )

  const doLogin = useCallback(async (): Promise<void> => {
    setLoginBusy(true)
    setLoginMessage(null)
    try {
      if (loginMode === 'gh') {
        if (!loginToken.trim()) {
          setLoginMessage('Pega un token (ghp_… o github_pat_…).')
          return
        }
        const res = await gitApi.authLoginGh({
          token: loginToken.trim(),
          host: loginHost.trim() || undefined
        })
        if (res.ok) {
          setLoginMessage(res.data.loggedIn ? `Logueado como ${res.data.user ?? 'gh'}.` : 'gh disponible pero sin sesión.')
          setLoginToken('')
        } else {
          setLoginMessage(`Error: ${res.error.message}`)
        }
      } else {
        if (!loginHost.trim() || !loginUser.trim() || !loginToken) {
          setLoginMessage('Host, usuario y token son obligatorios.')
          return
        }
        const res = await gitApi.authLoginHttps({
          host: loginHost.trim(),
          username: loginUser.trim(),
          token: loginToken
        })
        if (res.ok) {
          setLoginMessage('Credenciales guardadas en el helper del sistema.')
          setLoginToken('')
        } else {
          setLoginMessage(`Error: ${res.error.message}`)
        }
      }
    } finally {
      setLoginBusy(false)
      void refreshAuth()
    }
  }, [loginMode, loginHost, loginUser, loginToken])

  if (!workspaceRoot) {
    return (
      <div className={styles.git}>
        <p className={styles.empty}>Abre una carpeta para usar git.</p>
      </div>
    )
  }

  if (repos.length === 0) {
    return (
      <div className={styles.git}>
        <div className={styles.placeholder}>
          <ProductIcon id="source-control" size={24} className={styles.icon} aria-hidden="true" />
          <p className={styles.empty}>Sin repos git bajo este workspace.</p>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              void detectRepos(workspaceRoot)
            }}
          >
            <ProductIcon id="refresh" size={14} />
            Re-detectar
          </button>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => void initRepo(workspaceRoot)}
          >
            <ProductIcon id="plus" size={14} />
            Inicializar repo aquí
          </button>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className={styles.git}>
        <p className={styles.empty}>Cargando git…</p>
      </div>
    )
  }

  const localBranches = state.branches.filter((b) => !b.remote)
  const remoteBranches = state.branches.filter((b) => b.remote)
  const currentBranch = state.branches.find((b) => b.current)
  const hasChanges =
    state.staged.length + state.unstaged.length + state.untracked.length > 0

  return (
    <div className={styles.git}>
      {/* Selector de repo */}
      <button
        type="button"
        className={styles.repoSwitcher}
        title={state.toplevel}
        onClick={(event) => openRepoMenu(event.clientX, event.clientY)}
      >
        <ProductIcon id="folder" size={14} />
        <span className={styles.repoName}>{baseNameOf(state.toplevel)}</span>
        <span className={styles.repoBranch}>{state.branch ?? 'sin rama'}</span>
        <ProductIcon id="chevron-down" size={12} />
      </button>

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      {/* Sync */}
      <div className={styles.syncBar}>
        <span className={styles.syncBranch} title={state.upstream ?? 'sin upstream'}>
          <ProductIcon id="source-control" size={13} />
          {state.branch ?? '—'}
          {state.ahead ? <span className={styles.ahead}>↑{state.ahead}</span> : null}
          {state.behind ? <span className={styles.behind}>↓{state.behind}</span> : null}
        </span>
        <span className={styles.syncActions}>
          <button
            type="button"
            className={styles.mini}
            disabled={syncing !== null}
            title="Fetch --all --prune"
            onClick={() => void doSync('fetch')}
          >
            <ProductIcon id="refresh" size={13} />
            Fetch
          </button>
          <button
            type="button"
            className={styles.mini}
            disabled={syncing !== null}
            title="Pull --ff-only"
            onClick={() => void doSync('pull')}
          >
            <ProductIcon id="download" size={13} />
            Pull
          </button>
          <button
            type="button"
            className={styles.mini}
            disabled={syncing !== null}
            title={state.upstream ? 'Push' : 'Push --set-upstream'}
            onClick={() => void doSync('push')}
          >
            <ProductIcon id="arrow-up" size={13} />
            Push
          </button>
        </span>
      </div>

      <Section
        title="Archivos"
        open={sections.files}
        onToggle={() => toggleSection('files')}
      >
        <div className={styles.embeddedTree}>
          <ExplorerView key={activeRoot} root={activeRoot} interactive={false} />
        </div>
        <p className={styles.hint}>Solo lectura, con badges de git (A/M/??/D/R).</p>
      </Section>

      <Section
        title="Cambios"
        count={state.staged.length + state.unstaged.length + state.untracked.length}
        open={sections.changes}
        onToggle={() => toggleSection('changes')}
      >
        {activeRoot ? (
          <ChangedTree
            root={activeRoot}
            staged={state.staged}
            unstaged={state.unstaged}
            untracked={state.untracked}
            onStage={(paths) => withRoot((root) => stagePaths(root, paths))}
            onUnstage={(paths) => withRoot((root) => unstagePaths(root, paths))}
            onDiscard={(paths) => withRoot((root) => discardPaths(root, paths))}
          />
        ) : null}
        <div className={styles.commitBox}>
          <textarea
            className={styles.commitInput}
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.target.value)}
            placeholder="Mensaje de commit…"
            aria-label="Mensaje de commit"
            rows={2}
            spellCheck={false}
          />
          <div className={styles.commitActions}>
            <button
              type="button"
              className={styles.primary}
              disabled={committing || !commitMessage.trim() || state.staged.length === 0}
              onClick={() => void doCommit(false)}
            >
              <ProductIcon id="check" size={14} />
              Commit
            </button>
            <button
              type="button"
              className={styles.ghost}
              disabled={committing || !commitMessage.trim() || !hasChanges}
              title="Stage todo + commit"
              onClick={() => void doCommit(true)}
            >
              Todo
            </button>
          </div>
        </div>
      </Section>

      <Section
        title="Ramas"
        count={localBranches.length}
        open={sections.branches}
        onToggle={() => toggleSection('branches')}
      >
        {showNewBranch ? (
          <form
            className={styles.inlineForm}
            onSubmit={(event) => {
              event.preventDefault()
              if (!activeRoot || !newBranchName.trim()) return
              void createBranch(activeRoot, newBranchName.trim()).then(() => {
                setNewBranchName('')
                setShowNewBranch(false)
              })
            }}
          >
            <input
              className={styles.input}
              value={newBranchName}
              onChange={(event) => setNewBranchName(event.target.value)}
              placeholder="nombre-rama"
              aria-label="Nombre de rama"
              autoFocus
              spellCheck={false}
            />
            <button type="submit" className={styles.primary} disabled={!newBranchName.trim()}>
              Crear
            </button>
          </form>
        ) : null}
        {currentBranch ? (
          <div className={[styles.row, styles.rowCurrent].join(' ')}>
            <ProductIcon id="source-control" size={13} />
            <span className={styles.rowName}>{currentBranch.name}</span>
            <span className={styles.badge}>ACTUAL</span>
          </div>
        ) : null}
        {localBranches
          .filter((b) => !b.current)
          .map((branch) => (
            <div key={branch.name} className={styles.row} role="button" tabIndex={0}
              title={`Checkout ${branch.name}`}
              onClick={() => void checkoutBranch(branch)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void checkoutBranch(branch)
              }}
            >
              <ProductIcon id="source-control" size={13} />
              <span className={styles.rowName}>{branch.name}</span>
              {branch.track ? <span className={styles.track}>{branch.track}</span> : null}
              <button
                type="button"
                className={styles.rowBtn}
                aria-label={`Opciones de ${branch.name}`}
                title="Opciones"
                onClick={(event) => {
                  event.stopPropagation()
                  openBranchMenu(event, branch)
                }}
              >
                <ProductIcon id="more" size={13} />
              </button>
            </div>
          ))}
        {remoteBranches.length > 0 ? (
          <>
            <h4 className={styles.subTitle}>Remotas</h4>
            {remoteBranches.map((branch) => (
              <div key={branch.name} className={[styles.row, styles.rowRemote].join(' ')} role="button" tabIndex={0}
                title={`Checkout ${branch.name} (tracking)`}
                onClick={() => void checkoutBranch(branch)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void checkoutBranch(branch)
                }}
              >
                <ProductIcon id="source-control" size={13} />
                <span className={styles.rowName}>{branch.name}</span>
              </div>
            ))}
          </>
        ) : null}
      </Section>

      {state.deletedBranches.length > 0 ? (
        <Section
          title="Eliminadas"
          count={state.deletedBranches.length}
          open={sections.branches}
          onToggle={() => toggleSection('branches')}
        >
          {state.deletedBranches.map((deleted) => (
            <div key={`${deleted.name}-${deleted.sha}`} className={styles.row}>
              <ProductIcon id="history" size={13} />
              <span className={styles.rowName}>{deleted.name}</span>
              <span className={styles.rowMeta}>{deleted.sha.slice(0, 7)}</span>
              <button
                type="button"
                className={styles.mini}
                title={`Restaurar ${deleted.name} en ${deleted.sha.slice(0, 7)}`}
                onClick={() => withRoot((root) => createBranch(root, deleted.name, deleted.sha))}
              >
                Restaurar
              </button>
            </div>
          ))}
        </Section>
      ) : null}

      <Section
        title="Historial"
        count={state.log.length}
        open={sections.history}
        onToggle={() => toggleSection('history')}
      >
        <div className={styles.logRef}>
          <button
            type="button"
            className={styles.mini}
            title="Elegir ref del historial"
            onClick={(event) => {
              const options: Array<{ name: string; ref?: string }> = [{ name: 'HEAD' }]
                .concat(localBranches.map((b) => ({ name: b.name, ref: b.name })))
                .concat(remoteBranches.map((b) => ({ name: b.name, ref: b.name })))
              showContextMenu(
                event.clientX,
                event.clientY,
                options.map((item) => ({
                  label: item.name,
                  onClick: () => {
                    setLogRef(item.ref ?? 'HEAD')
                    if (activeRoot) void refreshRepoFull(activeRoot, item.ref)
                  }
                }))
              )
            }}
          >
            <ProductIcon id="history" size={13} />
            {logRef ?? state.branch ?? 'HEAD'}
            <ProductIcon id="chevron-down" size={12} />
          </button>
        </div>
        {state.log.length === 0 ? (
          <p className={styles.empty}>Sin commits (¿repo vacío?).</p>
        ) : (
          state.log.map((commit) => {
            const expanded = expandedSha === commit.sha
            const detail = commitDetail.get(commit.sha)
            return (
              <div key={commit.sha}>
                <div
                  className={[styles.row, styles.rowCommit].join(' ')}
                  role="button"
                  tabIndex={0}
                  title={commit.fullMessage}
                  onClick={() => setExpandedSha(expanded ? null : commit.sha)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') setExpandedSha(expanded ? null : commit.sha)
                  }}
                >
                  <span className={styles.dot} aria-hidden="true" />
                  <span className={styles.rowMain}>
                    <span className={styles.rowTop}>
                      <span className={styles.rowName}>{commit.message}</span>
                    </span>
                    <span className={styles.rowMeta}>
                      {commit.shortSha} · {commit.author} · {shortDate(commit.date)}
                      {commit.refs.length > 0 ? ` · ${commit.refs.join(', ')}` : ''}
                    </span>
                  </span>
                </div>
                {expanded ? (
                  <div className={styles.commitDetail}>
                    <p className={styles.commitFull}>{detail?.fullMessage ?? commit.fullMessage}</p>
                    {detail ? (
                      <ul className={styles.fileList}>
                        {detail.files.map((file) => (
                          <li key={`${file.status}-${file.path}`}>
                            <span className={styles.fileStatus}>{file.status}</span>
                            <span className={styles.filePath}>{file.path}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.rowMeta}>Cargando archivos…</p>
                    )}
                    <div className={styles.commitActions}>
                      <button type="button" className={styles.mini} onClick={() => copyText(commit.sha, 'SHA copiado')}>
                        <ProductIcon id="copy" size={12} />
                        SHA
                      </button>
                      <button type="button" className={styles.mini} onClick={() => withRoot((root) => revertCommit(root, commit.sha))}>
                        Revert
                      </button>
                      <button type="button" className={styles.mini} onClick={() => withRoot((root) => cherryPickCommit(root, commit.sha))}>
                        Cherry-pick
                      </button>
                      <button
                        type="button"
                        className={[styles.mini, styles.miniDanger].join(' ')}
                        onClick={() =>
                          void (async () => {
                            if (await confirmDanger(`Reset --hard a ${commit.shortSha} (pierde cambios)`, 'Reset --hard')) {
                              await withRoot((root) => resetRepo(root, 'hard', commit.sha))
                            }
                          })()
                        }
                      >
                        Reset --hard
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </Section>

      <Section
        title="Stash"
        count={state.stashes.length}
        open={sections.stash}
        onToggle={() => toggleSection('stash')}
      >
        {showStashForm ? (
          <form
            className={styles.inlineForm}
            onSubmit={(event) => {
              event.preventDefault()
              void stashSave(activeRoot ?? '', stashMessage.trim() || undefined).then(() => {
                setStashMessage('')
                setShowStashForm(false)
              })
            }}
          >
            <input
              className={styles.input}
              value={stashMessage}
              onChange={(event) => setStashMessage(event.target.value)}
              placeholder="Mensaje (opcional)"
              aria-label="Mensaje del stash"
              spellCheck={false}
            />
            <button type="submit" className={styles.primary}>
              Guardar
            </button>
          </form>
        ) : (
          <button type="button" className={styles.add} onClick={() => setShowStashForm(true)}>
            <ProductIcon id="plus" size={13} />
            Guardar stash
          </button>
        )}
        {state.stashes.length === 0 ? (
          <p className={styles.empty}>Sin stashes.</p>
        ) : (
          state.stashes.map((stash) => (
            <div key={stash.index} className={styles.row}>
              <ProductIcon id="history" size={13} />
              <span className={styles.rowMain}>
                <span className={styles.rowTop}>
                  <span className={styles.rowName}>{stash.message || `stash@{${stash.index}}`}</span>
                </span>
                {stash.branch ? <span className={styles.rowMeta}>{stash.branch}</span> : null}
              </span>
              <button type="button" className={styles.mini} title="Pop" onClick={() => withRoot((root) => stashPop(root, stash.index))}>
                Pop
              </button>
              <button
                type="button"
                className={styles.rowBtn}
                aria-label={`Opciones de stash@{${stash.index}}`}
                onClick={(event) => {
                              showContextMenu(event.clientX, event.clientY, [
                    {
                      label: 'Apply',
                      onClick: () => withRoot((root) => stashApply(root, stash.index))
                    },
                    {
                      label: 'Drop',
                      danger: true,
                      separatorBefore: true,
                      onClick: () =>
                        void (async () => {
                          if (await confirmDanger(`Eliminar stash@{${stash.index}}`, 'Eliminar')) {
                            await withRoot((root) => stashDrop(root, stash.index))
                          }
                        })()
                    }
                  ])
                }}
              >
                <ProductIcon id="more" size={13} />
              </button>
            </div>
          ))
        )}
      </Section>

      <Section
        title="Tags"
        count={state.tags.length}
        open={sections.tags}
        onToggle={() => toggleSection('tags')}
      >
        {showTagForm ? (
          <form
            className={styles.inlineForm}
            onSubmit={(event) => {
              event.preventDefault()
              if (!activeRoot || !tagName.trim()) return
              void createTag(activeRoot, tagName.trim()).then(() => {
                setTagName('')
                setShowTagForm(false)
              })
            }}
          >
            <input
              className={styles.input}
              value={tagName}
              onChange={(event) => setTagName(event.target.value)}
              placeholder="v1.0.0"
              aria-label="Nombre del tag"
              spellCheck={false}
            />
            <button type="submit" className={styles.primary} disabled={!tagName.trim()}>
              Crear
            </button>
          </form>
        ) : (
          <button type="button" className={styles.add} onClick={() => setShowTagForm(true)}>
            <ProductIcon id="plus" size={13} />
            Nuevo tag
          </button>
        )}
        {state.tags.length === 0 ? (
          <p className={styles.empty}>Sin tags.</p>
        ) : (
          state.tags.map((tag) => (
            <div key={tag.name} className={styles.row}>
              <ProductIcon id="pencil" size={13} />
              <span className={styles.rowName}>{tag.name}</span>
              {tag.date ? <span className={styles.rowMeta}>{shortDate(tag.date)}</span> : null}
              <button
                type="button"
                className={styles.rowBtn}
                aria-label={`Eliminar tag ${tag.name}`}
                onClick={() =>
                  void (async () => {
                    if (await confirmDanger(`Eliminar tag ${tag.name}`, 'Eliminar')) {
                      await withRoot((root) => deleteTag(root, tag.name))
                    }
                  })()
                }
              >
                <ProductIcon id="trash" size={12} />
              </button>
            </div>
          ))
        )}
      </Section>

      <Section
        title="Remotos"
        count={state.remotes.length}
        open={sections.remotes}
        onToggle={() => toggleSection('remotes')}
      >
        {showRemoteForm ? (
          <form
            className={styles.inlineForm}
            onSubmit={(event) => {
              event.preventDefault()
              if (!activeRoot || !remoteName.trim() || !remoteUrl.trim()) return
              void addRemote(activeRoot, remoteName.trim(), remoteUrl.trim()).then(() => {
                setRemoteName('')
                setRemoteUrl('')
                setShowRemoteForm(false)
              })
            }}
          >
            <input
              className={styles.input}
              value={remoteName}
              onChange={(event) => setRemoteName(event.target.value)}
              placeholder="origin"
              aria-label="Nombre del remoto"
              spellCheck={false}
            />
            <input
              className={styles.input}
              value={remoteUrl}
              onChange={(event) => setRemoteUrl(event.target.value)}
              placeholder="https://… o git@…"
              aria-label="URL del remoto"
              spellCheck={false}
            />
            <button type="submit" className={styles.primary} disabled={!remoteName.trim() || !remoteUrl.trim()}>
              Agregar
            </button>
          </form>
        ) : (
          <button type="button" className={styles.add} onClick={() => setShowRemoteForm(true)}>
            <ProductIcon id="plus" size={13} />
            Agregar remoto
          </button>
        )}
        {state.remotes.length === 0 ? (
          <p className={styles.empty}>Sin remotos.</p>
        ) : (
          state.remotes.map((remote) => (
            <div key={remote.name} className={styles.row}>
              <ProductIcon id="source-control" size={13} />
              <span className={styles.rowMain}>
                <span className={styles.rowTop}>
                  <span className={styles.rowName}>{remote.name}</span>
                </span>
                <span className={styles.rowPath}>{remote.fetchUrl || remote.pushUrl}</span>
              </span>
              <button
                type="button"
                className={styles.rowBtn}
                aria-label={`Quitar remoto ${remote.name}`}
                onClick={() =>
                  void (async () => {
                    if (await confirmDanger(`Quitar remoto ${remote.name}`, 'Quitar')) {
                      await withRoot((root) => removeRemote(root, remote.name))
                    }
                  })()
                }
              >
                <ProductIcon id="trash" size={12} />
              </button>
            </div>
          ))
        )}
      </Section>

      <Section
        title="Cuenta"
        open={sections.account}
        onToggle={() => toggleSection('account')}
      >
        <AuthSection />
        <AccountLoginForm
          mode={loginMode}
          setMode={setLoginMode}
          host={loginHost}
          setHost={setLoginHost}
          user={loginUser}
          setUser={setLoginUser}
          token={loginToken}
          setToken={setLoginToken}
          busy={loginBusy}
          message={loginMessage}
          onLogin={() => void doLogin()}
          onLogout={async () => {
            const res = await gitApi.authLogoutGh({})
            if (!res.ok) setLoginMessage(`Error: ${res.error.message}`)
            else setLoginMessage('Sesión gh cerrada.')
            void refreshAuth()
          }}
          sshState={sshState}
          onSshProbe={() => {
            setSshState('checking')
            void gitApi.sshProbe({ host: 'github.com' }).then((res) => {
              setSshState(res.ok && res.data ? 'ok' : 'fail')
            })
          }}
          onValidate={() => {
            if (!activeRoot) return
            setLoginMessage('Validando contra origin…')
            void gitApi.authValidate({ cwd: activeRoot }).then((res) => {
              setLoginMessage(res.ok ? 'Acceso OK.' : `Error: ${res.error.message}`)
            })
          }}
        />
      </Section>

      <Section
        title="Pull requests"
        count={state.prs.length}
        open={sections.prs}
        onToggle={() => toggleSection('prs')}
      >
        <PrSection
          prs={state.prs}
          expandedPr={expandedPr}
          setExpandedPr={setExpandedPr}
          showForm={showPrForm}
          setShowForm={setShowPrForm}
          title={prTitle}
          setTitle={setPrTitle}
          body={prBody}
          setBody={setPrBody}
          base={prBase}
          setBase={setPrBase}
          branches={localBranches.map((b) => b.name)}
          currentBranch={state.branch}
          onRefresh={() => activeRoot && void refreshPrs(activeRoot)}
          onCreate={() => {
            if (!activeRoot || !prTitle.trim()) return
            void createPr(activeRoot, {
              title: prTitle.trim(),
              body: prBody.trim() || undefined,
              base: prBase.trim() || undefined
            }).then((ok) => {
              if (ok) {
                setPrTitle('')
                setPrBody('')
                setPrBase('')
                setShowPrForm(false)
              }
            })
          }}
          onMerge={(number, method) => activeRoot && void mergePr(activeRoot, number, method)}
        />
      </Section>
    </div>
  )
}

// ── Subcomponentes (mismo archivo: UI del panel, sin lógica de negocio) ──

function Section({
  title,
  count,
  open,
  onToggle,
  children
}: {
  title: string
  count?: number
  open: boolean
  onToggle: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <section className={styles.section}>
      <button type="button" className={styles.sectionHeader} aria-expanded={open} onClick={onToggle}>
        <ProductIcon id={open ? 'chevron-down' : 'chevron-right'} size={12} />
        <span className={styles.sectionTitle}>{title}</span>
        {count !== undefined ? <span className={styles.count}>{count}</span> : null}
      </button>
      {open ? <div className={styles.sectionBody}>{children}</div> : null}
    </section>
  )
}

/**
 * Cambios con el explorer REAL: árbol virtualizado filtrado a cambiados
 * (staged/unstaged/untracked + ancestros), con badges de git y acciones
 * bulk sobre la selección (lasso incluido).
 */
function ChangedTree({
  root,
  staged,
  unstaged,
  untracked,
  onStage,
  onUnstage,
  onDiscard
}: {
  root: string
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: GitFileChange[]
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard: (paths: string[]) => void
}): JSX.Element {
  const [selected, setSelected] = useState<string[]>([])
  const [badgesOn, setBadgesOn] = useState(() => isGitDecorationsVisible())

  useEffect(() => subscribeToGit(() => setBadgesOn(isGitDecorationsVisible())), [])

  const toAbs = useCallback(
    (rel: string): string => `${root.replace(/\/+$/, '')}/${rel}`,
    [root]
  )
  const toRel = useCallback(
    (abs: string): string => {
      const base = root.replace(/\/+$/, '')
      const clean = abs.replace(/\\/g, '/')
      return clean === base ? '' : clean.startsWith(`${base}/`) ? clean.slice(base.length + 1) : clean
    },
    [root]
  )
  const visiblePaths = useMemo(() => {
    const set = new Set<string>()
    for (const file of [...staged, ...unstaged, ...untracked]) {
      set.add(toAbs(file.path))
      if (file.origPath) set.add(toAbs(file.origPath))
    }
    return set
  }, [staged, unstaged, untracked, toAbs])

  const stagedSet = useMemo(() => new Set(staged.map((f) => toAbs(f.path))), [staged, toAbs])
  const toStage = selected.filter((p) => !stagedSet.has(p))
  const toUnstage = selected.filter((p) => stagedSet.has(p))
  const total = staged.length + unstaged.length + untracked.length

  if (total === 0) {
    return <p className={styles.empty}>Árbol limpio.</p>
  }

  return (
    <>
      {(toStage.length > 0 || toUnstage.length > 0) && (
        <div className={styles.bulkBar}>
          <span className={styles.rowMeta}>{selected.length} seleccionados</span>
          {toStage.length > 0 ? (
            <button type="button" className={styles.mini} onClick={() => onStage(toStage.map(toRel))}>
              <ProductIcon id="plus" size={12} />
              Stage ({toStage.length})
            </button>
          ) : null}
          {toUnstage.length > 0 ? (
            <button type="button" className={styles.mini} onClick={() => onUnstage(toUnstage.map(toRel))}>
              <ProductIcon id="x" size={12} />
              Unstage ({toUnstage.length})
            </button>
          ) : null}
          <button
            type="button"
            className={[styles.mini, styles.miniDanger].join(' ')}
            onClick={() =>
              void (async () => {
                if (await confirmDanger(`Descartar cambios de ${selected.length} archivos`, 'Descartar')) {
                  onDiscard(selected.map(toRel))
                }
              })()
            }
          >
            <ProductIcon id="trash" size={12} />
            Descartar
          </button>
        </div>
      )}
      <div className={styles.embeddedTree}>
        <ExplorerView
          key={root}
          root={root}
          interactive={false}
          visiblePaths={visiblePaths}
          onSelectionChange={setSelected}
        />
      </div>
      {!badgesOn ? (
        <p className={styles.hint}>
          Badges apagados.{' '}
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => setGitDecorationsVisible(true)}
          >
            Mostrar estados
          </button>
        </p>
      ) : null}
    </>
  )
}

function AuthSection(): JSX.Element {
  const auth = getAuthState()
  if (auth.loading && !auth.detected) {
    return <p className={styles.rowMeta}>Detectando auth…</p>
  }
  const detected = auth.detected
  if (!detected) {
    return <p className={styles.rowMeta}>Auth no detectada todavía.</p>
  }
  return (
    <ul className={styles.authList}>
      <AuthRow
        ok={detected.ghAvailable}
        label="gh CLI"
        detail={detected.ghAvailable ? 'instalado' : 'no instalado (cli.github.com)'}
      />
      <AuthRow
        ok={detected.ghLoggedIn}
        label="Sesión gh"
        detail={detected.ghLoggedIn ? (detected.ghUser ?? 'logueado') : 'sin sesión'}
      />
      <AuthRow
        ok={detected.credentialHelper !== null}
        label="Credential helper"
        detail={detected.credentialHelper ?? 'ninguno'}
      />
    </ul>
  )
}

function AuthRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }): JSX.Element {
  return (
    <li className={styles.authRow}>
      <span className={[styles.dot, ok ? styles.dotOk : styles.dotIdle].join(' ')} aria-hidden="true" />
      <span className={styles.rowName}>{label}</span>
      <span className={styles.rowMeta}>{detail}</span>
    </li>
  )
}

function AccountLoginForm(props: {
  mode: 'gh' | 'https'
  setMode: (mode: 'gh' | 'https') => void
  host: string
  setHost: (v: string) => void
  user: string
  setUser: (v: string) => void
  token: string
  setToken: (v: string) => void
  busy: boolean
  message: string | null
  onLogin: () => void
  onLogout: () => void
  sshState: 'idle' | 'checking' | 'ok' | 'fail'
  onSshProbe: () => void
  onValidate: () => void
}): JSX.Element {
  const auth = getAuthState()
  return (
    <div className={styles.loginBox}>
      <div className={styles.loginTabs} role="tablist" aria-label="Método de login">
        {(['gh', 'https'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={props.mode === mode}
            className={[styles.loginTab, props.mode === mode ? styles.loginTabActive : null]
              .filter(Boolean)
              .join(' ')}
            onClick={() => props.setMode(mode)}
          >
            {mode === 'gh' ? 'Token gh' : 'HTTPS'}
          </button>
        ))}
      </div>
      {props.mode === 'https' ? (
        <>
          <input
            className={styles.input}
            value={props.host}
            onChange={(event) => props.setHost(event.target.value)}
            placeholder="github.com"
            aria-label="Host"
            spellCheck={false}
          />
          <input
            className={styles.input}
            value={props.user}
            onChange={(event) => props.setUser(event.target.value)}
            placeholder="Usuario"
            aria-label="Usuario"
            spellCheck={false}
          />
        </>
      ) : (
        <input
          className={styles.input}
          value={props.host}
          onChange={(event) => props.setHost(event.target.value)}
          placeholder="Host (vacío = github.com, enterprise opcional)"
          aria-label="Host de GitHub Enterprise (opcional)"
          spellCheck={false}
        />
      )}
      <input
        className={styles.input}
        type="password"
        value={props.token}
        onChange={(event) => props.setToken(event.target.value)}
        placeholder={props.mode === 'gh' ? 'ghp_… o github_pat_…' : 'Token / password'}
        aria-label="Token"
        spellCheck={false}
        autoComplete="off"
      />
      {props.message ? <p className={styles.loginMessage}>{props.message}</p> : null}
      <div className={styles.loginActions}>
        <button type="button" className={styles.primary} disabled={props.busy} onClick={props.onLogin}>
          <ProductIcon id="key" size={14} />
          {props.busy ? 'Ingresando…' : 'Login'}
        </button>
        {auth.detected?.ghLoggedIn ? (
          <button type="button" className={styles.ghost} disabled={props.busy} onClick={props.onLogout}>
            Logout gh
          </button>
        ) : null}
        <button type="button" className={styles.ghost} onClick={props.onValidate} title="git ls-remote origin">
          Validar
        </button>
        <button
          type="button"
          className={styles.ghost}
          onClick={props.onSshProbe}
          title="ssh -T git@github.com en batch"
        >
          SSH: {props.sshState === 'idle' ? 'probar' : props.sshState === 'checking' ? '…' : props.sshState === 'ok' ? 'OK' : 'falló'}
        </button>
      </div>
      <p className={styles.hint}>
        {props.mode === 'gh'
          ? 'Ejecuta gh auth login --with-token por stdin; el token nunca va en argv ni en logs.'
          : 'Guarda en el credential helper del sistema (keychain) vía git credential approve.'}
      </p>
    </div>
  )
}

function PrSection(props: {
  prs: PullRequest[]
  expandedPr: number | null
  setExpandedPr: (n: number | null) => void
  showForm: boolean
  setShowForm: (v: boolean) => void
  title: string
  setTitle: (v: string) => void
  body: string
  setBody: (v: string) => void
  base: string
  setBase: (v: string) => void
  branches: string[]
  currentBranch: string | null
  onRefresh: () => void
  onCreate: () => void
  onMerge: (number: number, method: 'merge' | 'squash' | 'rebase') => void
}): JSX.Element {
  return (
    <>
      <div className={styles.prToolbar}>
        <button type="button" className={styles.add} onClick={() => props.setShowForm(!props.showForm)}>
          <ProductIcon id="plus" size={13} />
          Nuevo PR
        </button>
        <button type="button" className={styles.mini} onClick={props.onRefresh} title="gh pr list">
          <ProductIcon id="refresh" size={12} />
          Actualizar
        </button>
      </div>
      {props.showForm ? (
        <div className={styles.prForm}>
          <input
            className={styles.input}
            value={props.title}
            onChange={(event) => props.setTitle(event.target.value)}
            placeholder="Título del PR"
            aria-label="Título del PR"
            spellCheck={false}
          />
          <textarea
            className={styles.commitInput}
            value={props.body}
            onChange={(event) => props.setBody(event.target.value)}
            placeholder="Descripción (opcional)"
            aria-label="Descripción del PR"
            rows={3}
            spellCheck={false}
          />
          <div className={styles.prFormRow}>
            <input
              className={styles.input}
              value={props.base}
              onChange={(event) => props.setBase(event.target.value)}
              placeholder={`Base (default: main) · head: ${props.currentBranch ?? '?'}`}
              aria-label="Rama base"
              spellCheck={false}
              list="git-pr-bases"
            />
            <datalist id="git-pr-bases">
              {props.branches.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <button type="button" className={styles.primary} disabled={!props.title.trim()} onClick={props.onCreate}>
              Crear
            </button>
          </div>
          <p className={styles.hint}>Ejecuta gh pr create real (requiere gh + sesión).</p>
        </div>
      ) : null}
      {props.prs.length === 0 ? (
        <p className={styles.empty}>Sin PRs abiertos (¿gh instalado y logueado?).</p>
      ) : (
        props.prs.map((pr) => {
          const expanded = props.expandedPr === pr.number
          const failing = pr.checks.some((c) => /fail/i.test(c.conclusion || c.status))
          const pending = pr.checks.length > 0 && !failing && pr.checks.some((c) => !/success|failure|skipped|cancelled/i.test(c.conclusion || c.status))
          return (
            <div key={pr.number}>
              <div
                className={styles.row}
                role="button"
                tabIndex={0}
                onClick={() => props.setExpandedPr(expanded ? null : pr.number)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') props.setExpandedPr(expanded ? null : pr.number)
                }}
              >
                <span className={styles.prNumber}>#{pr.number}</span>
                <span className={styles.rowMain}>
                  <span className={styles.rowTop}>
                    <span className={styles.rowName}>{pr.title}</span>
                    {pr.isDraft ? <span className={styles.badgeMuted}>DRAFT</span> : null}
                  </span>
                  <span className={styles.rowMeta}>
                    {pr.headRef} → {pr.baseRef} · {pr.author}
                    {pr.checks.length > 0 ? (
                      <span className={[styles.checkDot, failing ? styles.dotFail : pending ? styles.dotWarn : styles.dotOk].join(' ')} aria-hidden="true" />
                    ) : null}
                  </span>
                </span>
              </div>
              {expanded ? (
                <div className={styles.commitDetail}>
                  {pr.body ? <p className={styles.commitFull}>{pr.body.slice(0, 2000)}</p> : null}
                  {pr.checks.length > 0 ? (
                    <ul className={styles.fileList}>
                      {pr.checks.map((check, i) => (
                        <li key={`${check.name}-${i}`}>
                          <span className={styles.fileStatus}>{check.conclusion || check.status || '?'}</span>
                          <span className={styles.filePath}>{check.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className={styles.commitActions}>
                    <a className={styles.mini} href={pr.url} target="_blank" rel="noreferrer">
                      <ProductIcon id="link-external" size={12} />
                      Abrir
                    </a>
                    <button
                      type="button"
                      className={styles.mini}
                      onClick={(event) => {
                                          showContextMenu(event.clientX, event.clientY, [
                          { label: 'Merge', onClick: () => props.onMerge(pr.number, 'merge') },
                          { label: 'Squash', onClick: () => props.onMerge(pr.number, 'squash') },
                          { label: 'Rebase', onClick: () => props.onMerge(pr.number, 'rebase') }
                        ])
                      }}
                    >
                      Merge…
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })
      )}
    </>
  )
}
