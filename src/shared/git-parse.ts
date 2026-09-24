// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Parsers puros de git (compartidos main + renderer + tests).
 *
 * Entrada: stdout de git con formatos estables y separadores de control.
 * Sin DOM, sin IPC, sin efectos.
 */

import type {
  GitStatus,
  GitCommit,
  GitBranch,
  ReflogEntry,
  DeletedBranch,
  GitFileChange,
  GitRemote,
  GitStash,
  GitTag,
  PullRequest,
  PrCheck
} from './git'

export function parseStatus(out: string): GitStatus {
  const staged: GitFileChange[] = []
  const unstaged: GitFileChange[] = []
  const untracked: GitFileChange[] = []
  let branch: string | null = null
  let ahead: number | null = null
  let behind: number | null = null
  let upstream: string | null = null
  for (const line of out.split('\n')) {
    if (line.startsWith('## ')) {
      const head = line.slice(3)
      const dotdot = head.indexOf('...')
      if (dotdot === -1) {
        branch = head === 'HEAD (no branch)' || head.startsWith('HEAD (') ? null : head
        continue
      }
      const local = head.slice(0, dotdot)
      branch = local === 'HEAD (no branch)' ? null : local
      const rest = head.slice(dotdot + 3)
      const bracket = rest.indexOf(' [')
      upstream = (bracket === -1 ? rest : rest.slice(0, bracket)) || null
      const mAhead = rest.match(/ahead (\d+)/)
      const mBehind = rest.match(/behind (\d+)/)
      ahead = mAhead ? parseInt(mAhead[1], 10) : 0
      behind = mBehind ? parseInt(mBehind[1], 10) : 0
      if (upstream === null) {
        ahead = null
        behind = null
      }
      continue
    }
    if (line.length < 4) continue
    const xy = line.slice(0, 2)
    if (xy === '??') {
      untracked.push({ path: line.slice(3).trim(), xy })
      continue
    }
    if (xy === '!!') continue
    let filePath = line.slice(3)
    let orig: string | undefined
    const arrow = filePath.indexOf(' -> ')
    if (arrow !== -1 && (xy[0] === 'R' || xy[1] === 'R' || xy[0] === 'C' || xy[1] === 'C')) {
      orig = filePath.slice(0, arrow).trim().replace(/^"|"$/g, '')
      filePath = filePath.slice(arrow + 4).trim().replace(/^"|"$/g, '')
    }
    const entry = { path: filePath.trim().replace(/^"|"$/g, ''), xy, ...(orig ? { origPath: orig } : {}) }
    if (xy[0] !== ' ' && xy[0] !== '?') staged.push(entry)
    if (xy[1] !== ' ' && xy[1] !== '?') unstaged.push({ ...entry })
  }
  return { branch, ahead, behind, upstream, staged, unstaged, untracked }
}

export function parseLog(out: string): GitCommit[] {
  const commits: GitCommit[] = []
  for (const record of out.split('\x1e')) {
    const trimmed = record.trim()
    if (!trimmed) continue
    const parts = trimmed.split('\x1f')
    if (parts.length < 7) continue
    const [sha, shortSha, author, email, date, refsRaw, subject] = parts
    const body = parts.slice(7).join('\x1f').trim()
    const refs = (refsRaw ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => r.replace(/^HEAD -> /, ''))
    commits.push({
      sha,
      shortSha,
      author,
      email,
      date,
      message: subject,
      fullMessage: body ? `${subject}\n\n${body}` : subject,
      refs
    })
  }
  return commits
}

export function parseBranches(out: string): GitBranch[] {
  const branches: GitBranch[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\x1f')
    if (parts.length < 7) continue
    const [refname, short, sha, upstream, track, head, date] = parts.map((p) => p.trim())
    const isRemote = refname.startsWith('refs/remotes/')
    branches.push({
      name: short,
      remote: isRemote ? short.split('/')[0] : null,
      current: head === '*',
      upstream: upstream || null,
      track: track || null,
      sha,
      date
    })
  }
  return branches
}

export function parseReflog(out: string): {
  entries: ReflogEntry[]
  deleted: DeletedBranch[]
} {
  const entries: ReflogEntry[] = []
  const deleted = new Map<string, DeletedBranch>()
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\x1f')
    if (parts.length < 4) continue
    const [sha, action, ref, date] = parts.map((p) => p.trim())
    entries.push({ sha, action, ref, date })
    // checkout: moving from X to Y → X puede haberse eliminado.
    const moved = action.match(/^checkout: moving from (\S+) to \S+/)
    if (moved && !deleted.has(moved[1]) && !/^[0-9a-f]{4,40}$/i.test(moved[1])) {
      deleted.set(moved[1], { name: moved[1], sha, date })
    }
  }
  return { entries, deleted: [...deleted.values()] }
}

export function parseNumstat(out: string): Array<{ path: string; added: number; removed: number }> {
  const rows: Array<{ path: string; added: number; removed: number }> = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const toNum = (v: string): number => (v === '-' ? 0 : parseInt(v, 10) || 0)
    rows.push({ path: parts.slice(2).join('\t'), added: toNum(parts[0]), removed: toNum(parts[1]) })
  }
  return rows
}

export interface ShownCommit extends GitCommit {
  files: Array<{ path: string; status: string }>
}

export function parseShow(out: string): ShownCommit {
  const sep = out.indexOf('\n')
  const header = (sep === -1 ? out : out.slice(0, sep)).trim()
  const rest = sep === -1 ? '' : out.slice(sep + 1)
  const parts = header.split('\x1f')
  const files: Array<{ path: string; status: string }> = []
  for (const line of rest.split('\n')) {
    if (!line.trim()) continue
    const status = line[0]
    const filePath = line.slice(1).trim()
    if (status && filePath) files.push({ path: filePath, status })
  }
  return {
    sha: parts[0] ?? '',
    shortSha: parts[1] ?? '',
    author: parts[2] ?? '',
    email: parts[3] ?? '',
    date: parts[4] ?? '',
    refs: (parts[5] ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => r.replace(/^HEAD -> /, '')),
    message: parts[6] ?? '',
    fullMessage: parts.slice(6).join('\x1f').trim(),
    files
  }
}

export function parseRemotes(out: string): GitRemote[] {
  const map = new Map<string, { fetchUrl: string; pushUrl: string }>()
  for (const line of out.split('\n')) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)/)
    if (!match) continue
    const [, name, url, kind] = match
    const entry = map.get(name) ?? { fetchUrl: '', pushUrl: '' }
    if (kind === 'fetch') entry.fetchUrl = url
    else entry.pushUrl = url
    map.set(name, entry)
  }
  return [...map.entries()].map(([name, urls]) => ({ name, ...urls }))
}

export function parseStash(out: string): GitStash[] {
  const stashes: GitStash[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\x1f')
    if (parts.length < 3) continue
    const index = parseInt((parts[0].match(/stash@{(\d+)}/)?.[1] ?? '-1'), 10)
    if (index < 0) continue
    const msg = parts[1]
    const branch = msg.match(/^On ([^:]+):/)?.[1] ?? ''
    stashes.push({ index, message: msg, branch })
  }
  return stashes
}

export function parseTags(out: string): GitTag[] {
  const tags: GitTag[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\x1f')
    if (!parts[0]) continue
    tags.push({ name: parts[0].trim(), date: (parts[1] ?? '').trim() })
  }
  return tags
}

export function parseGhUser(statusOut: string): { loggedIn: boolean; user: string | null; hosts: string[] } {
  const hosts: string[] = []
  let user: string | null = null
  let loggedIn = false
  for (const line of statusOut.split('\n')) {
    const host = line.match(/^\s*([a-z0-9.-]+)\s*:/i)?.[1]
    if (host && !hosts.includes(host)) hosts.push(host)
    // Formatos reales: "Logged in to github.com account USER (…)" y variantes con "as USER".
    const active = line.match(/Logged in to \S+ .*?(?:account|as) (\S+)/i)?.[1]
    if (active) {
      loggedIn = true
      user = user ?? active.replace(/[(),;]+$/, '')
    }
  }
  return { loggedIn, user, hosts }
}

function parseGhChecks(raw: unknown): PrCheck[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      name: String(c.name ?? c.workflowName ?? 'check'),
      status: String(c.status ?? ''),
      conclusion: String(c.conclusion ?? c.conclusionText ?? '')
    }))
    .slice(0, 30)
}

export function parseGhPrRecord(raw: Record<string, unknown>): PullRequest {
  const author =
    raw.author && typeof raw.author === 'object'
      ? String((raw.author as Record<string, unknown>).login ?? '')
      : ''
  return {
    number: Number(raw.number ?? 0),
    title: String(raw.title ?? ''),
    body: String(raw.body ?? ''),
    url: String(raw.url ?? ''),
    state: String(raw.state ?? ''),
    isDraft: raw.isDraft === true,
    headRef: String(raw.headRefName ?? ''),
    baseRef: String(raw.baseRefName ?? ''),
    author,
    checks: parseGhChecks(raw.statusCheckRollup),
    updatedAt: String(raw.updatedAt ?? '')
  }
}

export function parseGhPrList(out: string): PullRequest[] {
  const parsed: unknown = JSON.parse(out)
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(parseGhPrRecord)
}

export function parseGhPr(out: string): PullRequest {
  const parsed: unknown = JSON.parse(out)
  if (!parsed || typeof parsed !== 'object') throw new Error('Respuesta gh inválida')
  return parseGhPrRecord(parsed as Record<string, unknown>)
}
