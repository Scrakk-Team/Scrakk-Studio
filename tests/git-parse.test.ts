/**
 * Tests de los parsers puros de git (shared/git-parse.ts).
 */

import { describe, it, expect } from 'vitest'
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
  parseGhPrList
} from '@shared/git-parse'

describe('parseStatus', () => {
  it('rama + ahead/behind + staged/unstaged/untracked', () => {
    const out = [
      '## main...origin/main [ahead 2, behind 1]',
      'M  src/a.ts',
      ' M src/b.ts',
      'AM src/c.ts',
      '?? nuevo.txt',
      'R  viejo.ts -> nuevo.ts'
    ].join('\n')
    const st = parseStatus(out)
    expect(st.branch).toBe('main')
    expect(st.upstream).toBe('origin/main')
    expect(st.ahead).toBe(2)
    expect(st.behind).toBe(1)
    expect(st.staged.map((f) => f.path)).toEqual(['src/a.ts', 'src/c.ts', 'nuevo.ts'])
    expect(st.unstaged.map((f) => f.path)).toEqual(['src/b.ts', 'src/c.ts'])
    expect(st.untracked.map((f) => f.path)).toEqual(['nuevo.txt'])
    expect(st.staged.find((f) => f.path === 'nuevo.ts')?.origPath).toBe('viejo.ts')
  })

  it('sin upstream → ahead/behind null', () => {
    const st = parseStatus('## feature-x\n M a.ts')
    expect(st.branch).toBe('feature-x')
    expect(st.upstream).toBeNull()
    expect(st.ahead).toBeNull()
    expect(st.behind).toBeNull()
  })

  it('detached HEAD → branch null', () => {
    expect(parseStatus('## HEAD (no branch)').branch).toBeNull()
  })
})

describe('parseLog', () => {
  it('registros con separadores + refs', () => {
    const out =
      `abc123${'\x1f'}abc${'\x1f'}Ana${'\x1f'}a@x.com${'\x1f'}2026-01-01${'\x1f'}HEAD -> main, origin/main${'\x1f'}Fix${'\x1f'}cuerpo${'\x1e'}` +
      `def456${'\x1f'}def${'\x1f'}Bob${'\x1f'}b@x.com${'\x1f'}2026-01-02${'\x1f'}${'\x1f'}Otro${'\x1f'}${'\x1e'}`
    const log = parseLog(out)
    expect(log).toHaveLength(2)
    expect(log[0]).toMatchObject({ sha: 'abc123', author: 'Ana', message: 'Fix' })
    expect(log[0].refs).toEqual(['main', 'origin/main'])
    expect(log[0].fullMessage).toContain('cuerpo')
    expect(log[1].refs).toEqual([])
  })
})

describe('parseBranches', () => {
  it('local + remota + actual', () => {
    const out = [
      'refs/heads/main\x1fmain\x1fabc123\x1forigin/main\x1f\x1f*\x1f2026-01-01',
      'refs/heads/feat\x1ffeat\x1fdef456\x1f\x1f\x1f\x1f2026-01-02',
      'refs/remotes/origin/main\x1forigin/main\x1fabc123\x1f\x1f\x1f\x1f2026-01-01'
    ].join('\n')
    const branches = parseBranches(out)
    expect(branches).toHaveLength(3)
    expect(branches[0]).toMatchObject({ name: 'main', remote: null, current: true, upstream: 'origin/main' })
    expect(branches[2]).toMatchObject({ name: 'origin/main', remote: 'origin', current: false })
  })
})

describe('parseReflog', () => {
  it('detecta ramas eliminadas candidatas', () => {
    const out = [
      `aaa111${'\x1f'}checkout: moving from vieja to main${'\x1f'}HEAD@{0}${'\x1f'}2026-01-01`,
      `bbb222${'\x1f'}checkout: moving from main to otra${'\x1f'}HEAD@{1}${'\x1f'}2026-01-02`,
      `ccc333${'\x1f'}commit: algo${'\x1f'}HEAD@{2}${'\x1f'}2026-01-03`
    ].join('\n')
    const { entries, deleted } = parseReflog(out)
    expect(entries).toHaveLength(3)
    expect(deleted.map((d) => d.name).sort()).toEqual(['main', 'vieja'])
  })
})

describe('parseNumstat', () => {
  it('binarios (-) → 0', () => {
    const rows = parseNumstat('10\t2\tsrc/a.ts\n-\t-\timg.png\n')
    expect(rows).toEqual([
      { path: 'src/a.ts', added: 10, removed: 2 },
      { path: 'img.png', added: 0, removed: 0 }
    ])
  })
})

describe('parseShow', () => {
  it('header + archivos name-status', () => {
    const out = [
      `abc${'\x1f'}a${'\x1f'}Ana${'\x1f'}a@x${'\x1f'}2026${'\x1f'}${'\x1f'}Fix${'\x1f'}`,
      'M\tsrc/a.ts',
      'A\tsrc/b.ts'
    ].join('\n')
    const shown = parseShow(out)
    expect(shown.sha).toBe('abc')
    expect(shown.files).toEqual([
      { path: 'src/a.ts', status: 'M' },
      { path: 'src/b.ts', status: 'A' }
    ])
  })
})

describe('parseRemotes', () => {
  it('agrupa fetch/push', () => {
    const remotes = parseRemotes('origin\thttps://x.git (fetch)\norigin\thttps://x.git (push)\n')
    expect(remotes).toEqual([{ name: 'origin', fetchUrl: 'https://x.git', pushUrl: 'https://x.git' }])
  })
})

describe('parseStash', () => {
  it('índice + mensaje + rama', () => {
    const stashes = parseStash(`stash@{0}${'\x1f'}On main: wip${'\x1f'}2026-01-01\n`)
    expect(stashes).toEqual([{ index: 0, message: 'On main: wip', branch: 'main' }])
  })
})

describe('parseTags', () => {
  it('lista simple', () => {
    expect(parseTags(`v1.0.0${'\x1f'}2026-01-01\n`)).toEqual([{ name: 'v1.0.0', date: '2026-01-01' }])
  })
})

describe('parseGhUser', () => {
  it('sesión activa + hosts', () => {
    const parsed = parseGhUser('github.com:\n  Logged in to github.com account juliodev (keyring)\n')
    expect(parsed).toEqual({ loggedIn: true, user: 'juliodev', hosts: ['github.com'] })
  })

  it('sin sesión', () => {
    expect(parseGhUser('').loggedIn).toBe(false)
  })
})

describe('parseGhPrList', () => {
  it('PRs con checks', () => {
    const prs = parseGhPrList(
      JSON.stringify([
        {
          number: 7,
          title: 'Fix',
          body: 'b',
          url: 'https://x/7',
          state: 'OPEN',
          isDraft: false,
          headRefName: 'feat',
          baseRefName: 'main',
          author: { login: 'julio' },
          updatedAt: '2026-01-01',
          statusCheckRollup: [{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }]
        }
      ])
    )
    expect(prs).toHaveLength(1)
    expect(prs[0]).toMatchObject({ number: 7, headRef: 'feat', author: 'julio' })
    expect(prs[0].checks).toEqual([{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }])
  })

  it('no-array → vacío', () => {
    expect(parseGhPrList('{}')).toEqual([])
  })
})
