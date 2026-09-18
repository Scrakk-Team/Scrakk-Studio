/**
 * IPC de git real — corre en el proceso main.
 *
 * Seguridad:
 * - Sin shell jamás (execFile + argv fijo por handler, sin passthrough crudo).
 * - cwd debe ser un directorio existente; los paths de archivos deben vivir
 *   dentro del cwd (anti traversal).
 * - Nombres de branches/tags/remotos validados (sin `-` inicial ni
 *   caracteres de control/rangos de git).
 * - Tokens solo por stdin, jamás en argv; se scrulean de errores/logs.
 * - Todo con timeout + kill (nada interactivo: GIT_TERMINAL_PROMPT=0).
 */

import { ipcMain } from 'electron'
import { execFile, execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import {
  GIT_IPC,
  type GitError,
  type GitResult,
  type GitRepoInfo
} from '@shared/git'
import {
  parseStatus,
  parseLog,
  parseBranches,
  parseReflog,
  parseNumstat,
  parseShow,
  parseRemotes,
  parseStash,
  parseTags,
  parseGhUser,
  parseGhPr,
  parseGhPrList
} from '@shared/git-parse'

const DEFAULT_TIMEOUT = 30_000
const NETWORK_TIMEOUT = 120_000
const MAX_BUFFER = 16 * 1024 * 1024
const MAX_REPOS = 50
const MAX_SCAN_DEPTH = 4

interface RunOptions {
  timeoutMs?: number
  input?: string
  env?: Record<string, string>
}

interface RunOk {
  ok: true
  stdout: string
  stderr: string
  code: number
}

interface RunFail {
  ok: false
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

function run(
  bin: string,
  args: string[],
  cwd: string | undefined,
  opts: RunOptions = {}
): Promise<RunOk | RunFail> {
  return new Promise((resolve) => {
    const child = execFile(
      bin,
      args,
      {
        cwd,
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT,
        maxBuffer: MAX_BUFFER,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_OPTIONAL_LOCKS: '0',
          ...opts.env
        } as Record<string, string>,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        const out = String(stdout ?? '')
        const err = String(stderr ?? '')
        if (!error) {
          resolve({ ok: true, stdout: out, stderr: err, code: 0 })
          return
        }
        const code =
          typeof (error as { code?: unknown }).code === 'number'
            ? (error as { code: number }).code
            : 1
        const timedOut =
          (error as { killed?: unknown }).killed === true ||
          /timed out|ETIMEDOUT/i.test((error as Error).message)
        resolve({ ok: false, code, stdout: out, stderr: err, timedOut })
      }
    )
    if (opts.input !== undefined && child.stdin) {
      child.stdin.write(opts.input)
      child.stdin.end()
    }
  })
}

/** Quita secretos accidentales de un texto (tokens ghp_/gho_/github_pat_). */
function scrub(text: string): string {
  return text
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, '***')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '***')
    .replace(/x-access-token:[^@\s]+/g, 'x-access-token:***')
}

function fail<T>(code: GitError['code'], message: string): GitResult<T> {
  return { ok: false, error: { code, message } }
}

/**
 * Repo vacío (sin commits): git log/reflog fallan con fatal 128 en varios
 * idiomas. No es error: es lista vacía.
 */
const EMPTY_REPO_RE =
  /no commits yet|does not have any commits|bad default revision|unknown revision|revisi.n desconocida|aucun commit|keine commits|nessun commit/i

function emptyRepoAs<T>(empty: T): (res: { ok: boolean; stderr: string }) => GitResult<T> | null {
  return (res) => {
    if (!res.ok && EMPTY_REPO_RE.test(res.stderr)) return { ok: true, data: empty }
    return null
  }
}

function mapFailure<T>(res: RunFail, context: string): GitResult<T> {
  const stderr = scrub(res.stderr).trim()
  const tail = stderr.split('\n').slice(-3).join(' ').slice(0, 300)
  if (res.timedOut) return fail('timeout', `${context}: tiempo agotado`)
  if (/not a git repository|not a git repo/i.test(stderr)) {
    return fail('not-a-repo', 'No es un repositorio git')
  }
  if (
    /authentication failed|could not read username|permission denied|401|403|invalid credentials|logon failed/i.test(
      stderr
    )
  ) {
    return fail('auth', tail || `${context}: autenticación requerida`)
  }
  if (/^CONFLICT|merge conflict|could not apply|already exists|not possible to fast-forward|Your branch is ahead|Your local changes|stash your changes|Please commit your changes|overwritten by (merge|checkout)|Untracked working tree files/i.test(stderr + res.stdout)) {
    return fail('conflict', tail || `${context}: conflicto o estado bloqueante`)
  }
  return fail('failed', tail || `${context}: git falló (código ${res.code ?? '?'})`)
}

function resolveCwd(cwd: string): string | null {
  if (typeof cwd !== 'string' || !cwd) return null
  const normalized = path.normalize(cwd)
  if (!path.isAbsolute(normalized)) return null
  try {
    if (!fs.statSync(normalized).isDirectory()) return null
  } catch {
    return null
  }
  return normalized
}

/** Un path de archivo debe vivir dentro del cwd (anti traversal). */
function resolveInRepo(cwd: string, rel: string): string | null {
  if (typeof rel !== 'string' || !rel || rel.includes('\0')) return null
  const abs = path.normalize(path.join(cwd, rel))
  const relative = path.relative(cwd, abs)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return relative
}

/** Nombres git seguros (sin `-` inicial, controles ni sintaxis de revisión). */
function isSafeRefName(name: string): boolean {
  if (typeof name !== 'string' || !name || name.length > 200) return false
  if (name.startsWith('-') || name.startsWith('.')) return false
  if (/[\x00-\x20~^:?*\[\\@{]|\.\.|\/$/.test(name)) return false
  return true
}

function isSafeRemoteName(name: string): boolean {
  return typeof name === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(name)
}

function isSafeUrl(url: string): boolean {
  if (typeof url !== 'string' || !url || url.length > 2048) return false
  if (/[\x00-\x20]/.test(url)) return false
  return /^(https?:\/\/|ssh:\/\/|git@[^:]+:)/.test(url)
}

let gitBinary: boolean | null = null

async function hasGit(): Promise<boolean> {
  if (gitBinary !== null) return gitBinary
  try {
    const res = await run('git', ['--version'], undefined, { timeoutMs: 8000 })
    gitBinary = res.ok
  } catch {
    gitBinary = false
  }
  return gitBinary
}

async function needGit<T>(): Promise<GitResult<T> | null> {
  if (await hasGit()) return null
  return fail('no-binary', 'git no está instalado o no está en el PATH')
}

let ghBinary: boolean | null = null

async function hasGh(): Promise<boolean> {
  if (ghBinary !== null) return ghBinary
  const res = await run('gh', ['--version'], undefined, { timeoutMs: 8000 }).catch(
    (): RunFail => ({ ok: false, code: 1, stdout: '', stderr: '', timedOut: false })
  )
  ghBinary = res.ok
  return ghBinary
}

export function registerGitIpc(): void {
  const guarded = (
    channel: string,
    handler: (req: any) => Promise<GitResult<any>> // eslint-disable-line @typescript-eslint/no-explicit-any
  ): void => {
    ipcMain.handle(channel, async (_event, req: unknown) => {
      try {
        return await handler(req)
      } catch (error) {
        return fail('failed', scrub(error instanceof Error ? error.message : String(error)))
      }
    })
  }

  guarded(GIT_IPC.version, async () => {
    const missing = await needGit<string>()
    if (missing) return missing
    const res = await run('git', ['--version'], undefined, {})
    if (!res.ok) return mapFailure(res, 'git --version')
    return { ok: true, data: res.stdout.trim() }
  })

  guarded(GIT_IPC.detectRepos, async (req: { root: string; maxDepth?: number }) => {
    const root = resolveCwd(req.root)
    if (!root) return fail<GitRepoInfo[]>('invalid', 'Raíz inválida')
    const maxDepth = Math.max(0, Math.min(req.maxDepth ?? MAX_SCAN_DEPTH, 8))
    const found: GitRepoInfo[] = []
    const walk = (dir: string, depth: number): void => {
      if (found.length >= MAX_REPOS || depth > maxDepth) return
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (!entry.isDirectory() && entry.name !== '.git') continue
        if (entry.isDirectory() && entry.name === 'node_modules') continue
        if (entry.isDirectory() && entry.name.startsWith('.') && entry.name !== '.git') continue
        const full = path.join(dir, entry.name)
        if (entry.name === '.git' || (entry.isDirectory() && hasGitDir(full))) {
          const toplevel = toplevelOf(entry.name === '.git' ? dir : full)
          if (toplevel && !found.some((r) => r.toplevel === toplevel)) {
            found.push({ root: toplevel, toplevel })
          }
          continue
        }
        if (entry.isDirectory()) walk(full, depth + 1)
      }
    }
    const hasGitDir = (dir: string): boolean => {
      try {
        return fs.statSync(path.join(dir, '.git')).isDirectory()
      } catch {
        return false
      }
    }
    const toplevelOf = (dir: string): string | null => {
      try {
        const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
          cwd: dir,
          encoding: 'utf-8',
          timeout: 8000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        })
        const t = out.trim()
        return t || null
      } catch {
        return null
      }
    }
    walk(root, 0)
    // La raíz misma primero si es repo (caso común: un solo repo).
    found.sort((a, b) => (a.toplevel === root ? -1 : 0) - (b.toplevel === root ? -1 : 0))
    return { ok: true, data: found }
  })

  const needRepo = async <T>(cwd: string): Promise<GitResult<T> | string> => {
    const missing = await needGit<T>()
    if (missing) return missing
    const dir = resolveCwd(cwd)
    if (!dir) return fail<T>('invalid', 'Directorio inválido')
    return dir
  }

  const git = async <T>(
    cwd: string,
    args: string[],
    opts: RunOptions & { context: string; map?: (out: string, err: string) => GitResult<T> }
  ): Promise<GitResult<T>> => {
    const ready = await needRepo<T>(cwd)
    if (typeof ready !== 'string') return ready
    const res = await run('git', ['-c', 'color.ui=false', ...args], ready, opts)
    if (res.ok) {
      if (opts.map) {
        try {
          return opts.map(res.stdout, res.stderr)
        } catch (error) {
          return fail<T>('failed', scrub(error instanceof Error ? error.message : String(error)))
        }
      }
      return { ok: true, data: undefined as unknown as T }
    }
    return mapFailure<T>(res, opts.context)
  }

  guarded(GIT_IPC.status, async (req) =>
    git(req.cwd, ['status', '--porcelain=v1', '-b', '-uall'], {
      context: 'git status',
      map: (out) => ({ ok: true, data: parseStatus(out) })
    })
  )

  guarded(GIT_IPC.log, async (req) => {
    const limit = Math.max(1, Math.min(req.limit ?? 200, 1000))
    const args = [
      'log',
      `--max-count=${limit}`,
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%cI%x1f%D%x1f%s%x1f%b%x1e',
      '--no-color'
    ]
    if (req.ref) args.push(req.ref)
    const ready = await needRepo<import('@shared/git').GitCommit[]>(req.cwd)
    if (typeof ready !== 'string') return ready
    const res = await run('git', ['-c', 'color.ui=false', ...args], ready, {})
    if (!res.ok) {
      return emptyRepoAs<import('@shared/git').GitCommit[]>([])(res) ?? mapFailure(res, 'git log')
    }
    return { ok: true, data: parseLog(res.stdout) }
  })

  guarded(GIT_IPC.branches, async (req) =>
    git(
      req.cwd,
      [
        'branch',
        '--format=%(refname)%1f%(refname:short)%1f%(objectname:short)%1f%(upstream:short)%1f%(upstream:trackshort)%1f%(HEAD)%1f%(committerdate:iso)',
        '--all',
        '--sort=-committerdate'
      ],
      { context: 'git branch', map: (out) => ({ ok: true, data: parseBranches(out) }) }
    )
  )

  guarded(GIT_IPC.reflog, async (req) => {
    const limit = Math.max(1, Math.min(req.limit ?? 100, 500))
    const ready = await needRepo<{ entries: import('@shared/git').ReflogEntry[]; deleted: import('@shared/git').DeletedBranch[] }>(req.cwd)
    if (typeof ready !== 'string') return ready
    const res = await run(
      'git',
      ['-c', 'color.ui=false', 'reflog', `--max-count=${limit}`, `--pretty=format:%H%x1f%gs%x1f%gd%x1f%cI`, '--date=iso'],
      ready,
      {}
    )
    if (!res.ok) {
      return (
        emptyRepoAs<{ entries: import('@shared/git').ReflogEntry[]; deleted: import('@shared/git').DeletedBranch[] }>({
          entries: [],
          deleted: []
        })(res) ?? mapFailure(res, 'git reflog')
      )
    }
    return { ok: true, data: parseReflog(res.stdout) }
  })

  guarded(GIT_IPC.diffNumstat, async (req) => {
    const args = ['diff', '--numstat', '--no-color', '--no-ext-diff']
    if (req.staged) args.push('--cached')
    else if (req.ref) args.push(req.ref)
    return git(req.cwd, args, {
      context: 'git diff',
      map: (out) => ({ ok: true, data: parseNumstat(out) })
    })
  })

  guarded(GIT_IPC.showCommit, async (req) => {
    if (!/^[0-9a-f]{4,40}$/i.test(req.sha)) return fail('invalid', 'SHA inválido')
    return git(
      req.cwd,
      [
        'show',
        '--no-color',
        '--no-ext-diff',
        '--name-status',
        '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%cI%x1f%D%x1f%s%x1f%b',
        req.sha
      ],
      { context: 'git show', map: (out) => ({ ok: true, data: parseShow(out) }) }
    )
  })

  guarded(GIT_IPC.stage, async (req) => {
    const ready = await needRepo<null>(req.cwd)
    if (typeof ready !== 'string') return ready
    const paths = ((req.paths ?? []) as string[]).map((p: string) => resolveInRepo(ready, p))
    if (paths.some((p) => p === null)) return fail('invalid', 'Ruta fuera del repo')
    const res = await run('git', ['-c', 'color.ui=false', 'add', '--', ...(paths as string[])], ready, {})
    if (!res.ok) return mapFailure(res, 'git add')
    return { ok: true, data: null }
  })

  guarded(GIT_IPC.unstage, async (req) => {
    const ready = await needRepo<null>(req.cwd)
    if (typeof ready !== 'string') return ready
    const paths = ((req.paths ?? []) as string[]).map((p: string) => resolveInRepo(ready, p))
    if (paths.some((p) => p === null)) return fail('invalid', 'Ruta fuera del repo')
    const res = await run('git', ['-c', 'color.ui=false', 'reset', 'HEAD', '--', ...(paths as string[])], ready, {})
    if (!res.ok) return mapFailure(res, 'git reset')
    return { ok: true, data: null }
  })

  guarded(GIT_IPC.discard, async (req) => {
    const ready = await needRepo<null>(req.cwd)
    if (typeof ready !== 'string') return ready
    const paths = ((req.paths ?? []) as string[]).map((p: string) => resolveInRepo(ready, p))
    if (paths.length === 0) return { ok: true, data: null }
    if (paths.some((p) => p === null)) return fail('invalid', 'Ruta fuera del repo')
    const list = paths as string[]
    // Trackeados → checkout; untracked → clean -f (cada uno ignora al otro).
    const [checkoutRes, cleanRes] = await Promise.all([
      run('git', ['-c', 'color.ui=false', 'checkout', '--', ...list], ready, {}),
      run('git', ['-c', 'color.ui=false', 'clean', '-f', '--', ...list], ready, {})
    ])
    if (!checkoutRes.ok && !cleanRes.ok) return mapFailure(checkoutRes, 'git checkout')
    return { ok: true, data: null }
  })

  guarded(GIT_IPC.commit, async (req) => {
    if (!req.message || !req.message.trim()) return fail('invalid', 'Mensaje vacío')
    if (req.message.length > 4000) return fail('invalid', 'Mensaje muy largo')
    const args = ['commit', '-m', req.message.trim()]
    if (req.amend) args.push('--amend', '--no-edit')
    if (req.stageAll) {
      const r = await git<string>(req.cwd, ['add', '-A'], { context: 'git add', timeoutMs: 60_000, map: (o) => ({ ok: true, data: o }) })
      if (!r.ok) return r as GitResult<string>
    }
    return git<string>(req.cwd, args, {
      context: 'git commit',
      map: (out) => ({ ok: true, data: out.trim() })
    })
  })

  guarded(GIT_IPC.checkout, async (req) => {
    const args = req.create ? ['checkout', '-b'] : ['checkout']
    if (req.create) {
      if (!isSafeRefName(req.ref)) return fail('invalid', 'Nombre de rama inválido')
      args.push(req.ref)
    } else {
      args.push(req.ref)
    }
    return git(req.cwd, args, { context: 'git checkout' })
  })

  guarded(GIT_IPC.branchCreate, async (req) => {
    if (!isSafeRefName(req.name)) return fail('invalid', 'Nombre de rama inválido')
    const args = ['branch', req.name]
    if (req.startPoint) args.push(req.startPoint)
    return git(req.cwd, args, { context: 'git branch' })
  })

  guarded(GIT_IPC.branchDelete, async (req) => {
    if (!isSafeRefName(req.name)) return fail('invalid', 'Nombre de rama inválido')
    return git(req.cwd, ['branch', req.force ? '-D' : '-d', req.name], { context: 'git branch -d' })
  })

  guarded(GIT_IPC.branchRename, async (req) => {
    if (!isSafeRefName(req.oldName) || !isSafeRefName(req.newName)) {
      return fail('invalid', 'Nombre de rama inválido')
    }
    return git(req.cwd, ['branch', '-m', req.oldName, req.newName], { context: 'git branch -m' })
  })

  guarded(GIT_IPC.push, async (req) => {
    const args = ['push']
    if (req.setUpstream) args.push('--set-upstream')
    if (req.remote) {
      if (!isSafeRemoteName(req.remote) && req.remote !== '.') return fail('invalid', 'Remoto inválido')
      args.push(req.remote)
    }
    if (req.branch) {
      if (!isSafeRefName(req.branch)) return fail('invalid', 'Rama inválida')
      args.push(req.branch)
    }
    return git<string>(req.cwd, args, {
      context: 'git push',
      timeoutMs: NETWORK_TIMEOUT,
      map: (out, err) => ({ ok: true, data: (out + err).trim() })
    })
  })

  guarded(GIT_IPC.pull, async (req) => {
    const args = ['pull', '--ff-only']
    if (req.remote) {
      if (!isSafeRemoteName(req.remote)) return fail('invalid', 'Remoto inválido')
      args.push(req.remote)
    }
    if (req.branch) {
      if (!isSafeRefName(req.branch)) return fail('invalid', 'Rama inválida')
      args.push(req.branch)
    }
    return git<string>(req.cwd, args, {
      context: 'git pull',
      timeoutMs: NETWORK_TIMEOUT,
      map: (out, err) => ({ ok: true, data: (out + err).trim() })
    })
  })

  guarded(GIT_IPC.fetch, async (req) => {
    const args = ['fetch', '--all']
    if (req.prune !== false) args.push('--prune')
    return git<string>(req.cwd, args, {
      context: 'git fetch',
      timeoutMs: NETWORK_TIMEOUT,
      map: (out, err) => ({ ok: true, data: (out + err).trim() })
    })
  })

  guarded(GIT_IPC.remotes, async (req) =>
    git(req.cwd, ['remote', '-v'], {
      context: 'git remote',
      map: (out) => ({ ok: true, data: parseRemotes(out) })
    })
  )

  guarded(GIT_IPC.remoteAdd, async (req) => {
    if (!isSafeRemoteName(req.name)) return fail('invalid', 'Nombre de remoto inválido')
    if (!isSafeUrl(req.url)) return fail('invalid', 'URL inválida')
    return git(req.cwd, ['remote', 'add', req.name, req.url], { context: 'git remote add' })
  })

  guarded(GIT_IPC.remoteRemove, async (req) => {
    if (!isSafeRemoteName(req.name)) return fail('invalid', 'Nombre de remoto inválido')
    return git(req.cwd, ['remote', 'remove', req.name], { context: 'git remote remove' })
  })

  guarded(GIT_IPC.stashList, async (req) =>
    git(req.cwd, ['stash', 'list', `--pretty=format:%gd%x1f%gs%x1f%ci`], {
      context: 'git stash',
      map: (out) => ({ ok: true, data: parseStash(out) })
    })
  )

  guarded(GIT_IPC.stashPush, async (req) => {
    const args = ['stash', 'push', '-m', req.message?.slice(0, 200) || 'scrakk']
    if (req.includeUntracked) args.push('--include-untracked')
    return git<string>(req.cwd, args, {
      context: 'git stash',
      map: (out) => ({ ok: true, data: out.trim() })
    })
  })

  guarded(GIT_IPC.stashPop, async (req) =>
    git<string>(req.cwd, req.index !== undefined ? ['stash', 'pop', `stash@{${req.index}}`] : ['stash', 'pop'], {
      context: 'git stash pop',
      map: (out, err) => ({ ok: true, data: (out + err).trim() })
    })
  )

  guarded(GIT_IPC.stashApply, async (req) =>
    git<string>(
      req.cwd,
      req.index !== undefined ? ['stash', 'apply', `stash@{${req.index}}`] : ['stash', 'apply'],
      { context: 'git stash apply', map: (out, err) => ({ ok: true, data: (out + err).trim() }) }
    )
  )

  guarded(GIT_IPC.stashDrop, async (req) => {
    if (!Number.isInteger(req.index) || req.index < 0) return fail('invalid', 'Índice inválido')
    return git(req.cwd, ['stash', 'drop', `stash@{${req.index}}`], { context: 'git stash drop' })
  })

  guarded(GIT_IPC.tags, async (req) =>
    git(req.cwd, ['for-each-ref', `--format=%(refname:short)%1f%(creatordate:iso)`, 'refs/tags', '--sort=-creatordate'], {
      context: 'git tag',
      map: (out) => ({ ok: true, data: parseTags(out) })
    })
  )

  guarded(GIT_IPC.tagCreate, async (req) => {
    if (!isSafeRefName(req.name)) return fail('invalid', 'Nombre de tag inválido')
    const args = req.message ? ['tag', '-a', req.name, '-m', req.message.slice(0, 500)] : ['tag', req.name]
    return git(req.cwd, args, { context: 'git tag' })
  })

  guarded(GIT_IPC.tagDelete, async (req) => {
    if (!isSafeRefName(req.name)) return fail('invalid', 'Nombre de tag inválido')
    return git(req.cwd, ['tag', '-d', req.name], { context: 'git tag -d' })
  })

  guarded(GIT_IPC.cherryPick, async (req) => {
    if (!/^[0-9a-f]{4,40}$/i.test(req.sha)) return fail('invalid', 'SHA inválido')
    return git<string>(req.cwd, ['cherry-pick', req.sha], {
      context: 'git cherry-pick',
      map: (out, err) => ({ ok: true, data: (out + err).trim() })
    })
  })

  guarded(GIT_IPC.revert, async (req) => {
    if (!/^[0-9a-f]{4,40}$/i.test(req.sha)) return fail('invalid', 'SHA inválido')
    return git<string>(req.cwd, ['revert', '--no-edit', req.sha], {
      context: 'git revert',
      map: (out, err) => ({ ok: true, data: (out + err).trim() })
    })
  })

  guarded(GIT_IPC.reset, async (req) => {
    if (req.mode !== 'soft' && req.mode !== 'mixed' && req.mode !== 'hard') {
      return fail('invalid', 'Modo inválido')
    }
    if (!/^[0-9a-f]{4,40}$/i.test(req.ref) && req.ref !== 'HEAD' && !isSafeRefName(req.ref)) {
      return fail('invalid', 'Ref inválida')
    }
    return git(req.cwd, ['reset', `--${req.mode}`, req.ref], { context: 'git reset' })
  })

  guarded(GIT_IPC.init, async (req) => {
    const dir = resolveCwd(req.cwd)
    if (!dir) return fail('invalid', 'Directorio inválido')
    const missing = await needGit<null>()
    if (missing) return missing
    const res = await run('git', ['init'], dir, {})
    if (!res.ok) return mapFailure(res, 'git init')
    return { ok: true, data: null }
  })

  // ── Auth ───────────────────────────────────────────────────────────────

  guarded(GIT_IPC.authDetect, async () => {
    const gh = await hasGh()
    let ghLoggedIn = false
    let ghUser: string | null = null
    if (gh) {
      const st = await run('gh', ['auth', 'status'], undefined, { timeoutMs: 15000 })
      const parsed = parseGhUser(st.stdout + st.stderr)
      ghLoggedIn = st.code === 0 && parsed.loggedIn
      ghUser = parsed.user
    }
    let helper: string | null = null
    if (await hasGit()) {
      const h = await run('git', ['config', '--get', 'credential.helper'], undefined, { timeoutMs: 8000 })
      if (h.ok && h.stdout.trim()) helper = h.stdout.trim().split('\n')[0].slice(0, 120)
    }
    return {
      ok: true,
      data: {
        ghAvailable: gh,
        ghLoggedIn,
        ghUser,
        credentialHelper: helper,
        sshGithubOk: null
      }
    }
  })

  const sshProbe = async (host: string): Promise<boolean | null> => {
    if (!/^[a-z0-9.-]+$/i.test(host)) return null
    const res = await run(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-T', `git@${host}`],
      undefined,
      { timeoutMs: 15000 }
    ).catch(() => null)
    if (!res) return null
    // Exit 1 + "successfully authenticated" = clave OK sin shell.
    if (/successfully authenticated/i.test(res.stderr + res.stdout)) return true
    if (res.code === 0) return true
    return false
  }

  guarded(GIT_IPC.authLoginGh, async (req) => {
    if (!(await hasGh())) return fail('invalid', 'gh CLI no instalado')
    if (!req.token || req.token.length < 10 || req.token.length > 500 || /[\s]/.test(req.token)) {
      return fail('invalid', 'Token inválido')
    }
    const env: Record<string, string> = {}
    if (req.host && req.host !== 'github.com') {
      if (!/^[a-z0-9.-]+$/i.test(req.host)) return fail('invalid', 'Host inválido')
      env.GH_HOST = req.host
      env.GITHUB_HOST = req.host
    }
    const res = await run('gh', ['auth', 'login', '--with-token'], undefined, {
      timeoutMs: 30_000,
      input: req.token.trim(),
      env
    })
    if (!res.ok) return mapFailure(res, 'gh auth login')
    ghBinary = true
    const st = await run('gh', ['auth', 'status'], undefined, { timeoutMs: 15000, env })
    const parsed = parseGhUser(st.stdout + st.stderr)
    return { ok: true, data: { available: true, loggedIn: st.code === 0, user: parsed.user, hosts: parsed.hosts } }
  })

  guarded(GIT_IPC.authLogoutGh, async (req) => {
    if (!(await hasGh())) return fail('invalid', 'gh CLI no instalado')
    const args = ['auth', 'logout']
    if (req.host && req.host !== 'github.com') {
      if (!/^[a-z0-9.-]+$/i.test(req.host)) return fail('invalid', 'Host inválido')
      args.push('--hostname', req.host)
    }
    const res = await run('gh', args, undefined, { timeoutMs: 30_000 })
    if (!res.ok) return mapFailure(res, 'gh auth logout')
    return { ok: true, data: null }
  })

  guarded(GIT_IPC.authLoginHttps, async (req) => {
    const missing = await needGit<null>()
    if (missing) return missing
    if (!/^[a-z0-9.-]+$/i.test(req.host)) return fail('invalid', 'Host inválido')
    if (!req.username || /[\s:]/.test(req.username) || req.username.length > 256) {
      return fail('invalid', 'Usuario inválido')
    }
    if (!req.token || req.token.length < 4 || req.token.length > 2000 || /[\r\n]/.test(req.token)) {
      return fail('invalid', 'Token inválido')
    }
    // Guarda en el credential helper del sistema (keychain) vía protocolo.
    const block = `protocol=https\nhost=${req.host}\nusername=${req.username}\npassword=${req.token.trim()}\n\n`
    const res = await run('git', ['credential', 'approve'], undefined, { timeoutMs: 15000, input: block })
    if (!res.ok) return mapFailure(res, 'git credential')
    return { ok: true, data: null }
  })

  guarded(GIT_IPC.authValidate, async (req) => {    const ready = await needRepo<string>(req.cwd)
    if (typeof ready !== 'string') return ready
    let url = req.url
    if (!url) {
      const r = await run('git', ['-c', 'color.ui=false', 'remote', 'get-url', 'origin'], ready, {})
      if (!r.ok || !r.stdout.trim()) return fail('invalid', 'Sin remoto origin')
      url = r.stdout.trim().split('\n')[0]
    }
    if (!isSafeUrl(url)) return fail('invalid', 'URL inválida')
    const res = await run('git', ['-c', 'color.ui=false', 'ls-remote', url, 'HEAD'], ready, {
      timeoutMs: 30_000
    })
    if (!res.ok) return mapFailure(res, 'git ls-remote')
    return { ok: true, data: res.stdout.trim().slice(0, 200) }
  })

  guarded(GIT_IPC.sshProbe, async (req) => {
    const result = await sshProbe(req.host)
    if (result === null) return fail<boolean>('invalid', 'Host inválido o sin ssh')
    return { ok: true, data: result }
  })

  // ── PRs (gh) ─────────────────────────────────────────────────────────

  const needGh = async <T>(): Promise<GitResult<T> | null> => {
    if (await hasGh()) return null
    return fail('invalid', 'gh CLI no instalado (https://cli.github.com)')
  }

  guarded(GIT_IPC.ghPrList, async (req) => {
    const missing = await needGh<import('@shared/git').PullRequest[]>()
    if (missing) return missing
    const ready = await needRepo<import('@shared/git').PullRequest[]>(req.cwd)
    if (typeof ready !== 'string') return ready
    const limit = Math.max(1, Math.min(req.limit ?? 30, 100))
    const res = await run(
      'gh',
      ['pr', 'list', '--state', req.state === 'all' ? 'all' : req.state === 'closed' ? 'closed' : 'open',
        '--limit', String(limit),
        '--json', 'number,title,body,url,state,isDraft,headRefName,baseRefName,author,updatedAt,statusCheckRollup'],
      ready,
      { timeoutMs: 30_000 }
    )
    if (!res.ok) return mapFailure(res, 'gh pr list')
    try {
      return { ok: true, data: parseGhPrList(res.stdout) }
    } catch (error) {
      return fail('failed', scrub(error instanceof Error ? error.message : String(error)))
    }
  })

  guarded(GIT_IPC.ghPrView, async (req) => {
    const missing = await needGh<import('@shared/git').PullRequest>()
    if (missing) return missing
    const ready = await needRepo<import('@shared/git').PullRequest>(req.cwd)
    if (typeof ready !== 'string') return ready
    if (!Number.isInteger(req.number) || req.number <= 0) return fail('invalid', 'Número inválido')
    const res = await run(
      'gh',
      ['pr', 'view', String(req.number), '--json', 'number,title,body,url,state,isDraft,headRefName,baseRefName,author,updatedAt,statusCheckRollup,comments,reviews'],
      ready,
      { timeoutMs: 30_000 }
    )
    if (!res.ok) return mapFailure(res, 'gh pr view')
    try {
      return { ok: true, data: parseGhPr(res.stdout) }
    } catch (error) {
      return fail('failed', scrub(error instanceof Error ? error.message : String(error)))
    }
  })

  guarded(GIT_IPC.ghPrCreate, async (req) => {
    const missing = await needGh<import('@shared/git').PullRequest>()
    if (missing) return missing
    const ready = await needRepo<import('@shared/git').PullRequest>(req.cwd)
    if (typeof ready !== 'string') return ready
    if (!req.title || !req.title.trim()) return fail('invalid', 'Título vacío')
    const args = ['pr', 'create', '--title', req.title.trim().slice(0, 300)]
    if (req.body) args.push('--body', req.body.slice(0, 8000))
    if (req.base) {
      if (!isSafeRefName(req.base)) return fail('invalid', 'Base inválida')
      args.push('--base', req.base)
    }
    if (req.head) {
      if (!/^[A-Za-z0-9_][A-Za-z0-9_./-]{0,200}$/.test(req.head)) return fail('invalid', 'Head inválido')
      args.push('--head', req.head)
    }
    if (req.draft) args.push('--draft')
    const res = await run('gh', args, ready, { timeoutMs: 60_000 })
    if (!res.ok) return mapFailure(res, 'gh pr create')
    const url = res.stdout.trim().split('\n').pop() ?? ''
    return {
      ok: true,
      data: {
        number: 0,
        title: req.title.trim(),
        body: req.body ?? '',
        url,
        state: 'OPEN',
        isDraft: !!req.draft,
        headRef: req.head ?? '',
        baseRef: req.base ?? '',
        author: '',
        checks: [],
        updatedAt: new Date().toISOString()
      }
    }
  })

  guarded(GIT_IPC.ghPrMerge, async (req) => {
    const missing = await needGh<string>()
    if (missing) return missing
    const ready = await needRepo<string>(req.cwd)
    if (typeof ready !== 'string') return ready
    if (!Number.isInteger(req.number) || req.number <= 0) return fail('invalid', 'Número inválido')
    const method = req.method === 'squash' ? '--squash' : req.method === 'rebase' ? '--rebase' : '--merge'
    const res = await run('gh', ['pr', 'merge', String(req.number), method], ready, { timeoutMs: 120_000 })
    if (!res.ok) return mapFailure(res, 'gh pr merge')
    return { ok: true, data: res.stdout.trim().slice(0, 500) }
  })

  void sshProbe
}
