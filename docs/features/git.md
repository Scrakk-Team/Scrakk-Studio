---
title: "Git"
group: features
order: 40
summary: "The Git panel: status and branches, per-file staging, the changes tree, commit vs commit-all, history, stash, tags, remotes and PRs over real git/gh IPC."
---
# Git

The Git panel (`git` panel) is a full source-control UI over real `git` and `gh`
processes. It supports several repositories under the workspace root, a filtered
changes tree with per-file staging, commit (staged) and commit-all, history,
branches, stash, tags, remotes, auth and pull requests. It is registered by
`GitCommandsBridge` on the command `git.panel` (`mod+shift+g`, toggling the `git`
panel in the right slot).

## Opening and the store

State lives in `@services/git` (`store.ts`), a singleton `Map<root, RepoState>`
with `subscribeToGit(listener)`:

```ts
import { getActiveRoot, getRepoState, subscribeToGit } from '@services/git'

const root = getActiveRoot()          // active repo root (or null)
const state = root ? getRepoState(root) : null
// state.branch, state.ahead/behind, state.staged/unstaged/untracked, ...
```

On boot the panel calls `detectRepos(workspaceRoot)` then `refreshRepoFull(active)`,
and it refreshes on window `focus`. `refreshRepo` is the fast path
(`status` + `branches` + `remotes`); `refreshRepoFull` adds `log` (limit 200),
`reflog` (100), stash and tags, then PRs (`ghPrList`, limit 30, `state: 'open'`).

`RepoState` also carries `logRef`, `deletedBranches`, `reflog` and `lastRefresh`.
With no root the panel shows an empty state; with no repo detected it offers
**Re-detectar** (`detectRepos`) and **Inicializar repo aquí** (`initRepo`).

## Status and sync

The status bar shows the repo (a picker when more than one), the current `branch`,
`↑ahead` / `↓behind`, and three sync buttons: **Fetch** (`fetchRepo`, `--prune`),
**Pull** (`pullRepo`) and **Push** (`pushRepo`, setting the upstream when missing).
All three are blocked while a sync is in flight.

## Changes tree and staging

The `changes` section renders `CommitBox` + `ChangedTree`. The tree is the
Explorer's `ExplorerView` in read-only mode, filtered with `visiblePaths` to the
paths in `staged ∪ unstaged ∪ untracked` (plus rename origins), so the changed
ancestors auto-expand. Per-file actions are hover buttons:

- a staged file shows `x` → `onUnstage` (`unstagePaths` → `gitApi.unstage`);
- an unstaged file shows `+` → `onStage` (`stagePaths` → `gitApi.stage`).

Selecting several files (click / Shift / **lasso**) raises a bulk bar with
**Stage**, **Unstage** and **Discard** for the relevant subset. Dragging the lasso
selects and stages the swept files at once (Ctrl/Cmd is additive). Discard calls
`discardPaths` (silent) after a confirm dialog.

```ts
import { stagePaths, unstagePaths, discardPaths } from '@services/git'

await stagePaths(root, ['src/a.ts', 'src/b.ts'])
await unstagePaths(root, ['src/a.ts'])
await discardPaths(root, ['src/a.ts'])
```

## Commit vs commit all

`CommitBox` has one message box and two buttons:

- **Commit** — requires staged changes (`hasStaged`); runs
  `commitChanges(root, message, { stageAll: false })`.
- **Todo** (commit all) — requires any change (`hasChanges`); runs
  `commitChanges(root, message, { stageAll: true })`.

Both call `gitApi.commit({ cwd, message, amend?, stageAll? })`; the message box
clears only on success. It is an uncontrolled `<textarea>` that re-renders only
when it crosses the empty/non-empty border, so typing does not repaint the tree.

## History and commit detail

The `history` section lists `state.log` (`gitApi.log`, limit 200) with a ref picker
(`HEAD` / local / remote branches → `refreshRepoFull(root, ref)`). Clicking a
commit expands it and lazily loads `gitApi.showCommit({ cwd, sha })` for its file
list; actions are **copy SHA**, **revert**, **cherry-pick** and **reset --hard**
(the last one after a confirm).

## Branches, stash, tags, remotes, PRs

- **Branches**: the current branch plus locals; clicking checks one out. A remote
  branch creates a local tracking branch (`createBranch` then `checkoutRef`). The
  context menu renames or deletes; deleted branches can be restored from reflog.
- **Stash**: save (optional message), pop, apply, drop.
- **Tags**: create and delete.
- **Remotes**: add and remove.
- **Account**: auth detection (`gh` CLI, `gh` session, credential helper), login
  with a GitHub token (`gh auth login --with-token` over stdin, never in argv) or
  an HTTPS credential helper, `git ls-remote` validation, and an SSH probe.
- **Pull requests**: list open PRs, create (`ghPrCreate`), merge
  (`merge` / `squash` / `rebase`) and show checks.

A read-only `files` section embeds the whole Explorer for the active repo. The
`changes`, `history`, `stash`, `tags`, `remotes`, `account` and `prs` sections are
collapsible; `changes` and `branches` start open.

## Badges and diffs

Badge decorations come from `GitDecorationsBridge` (always mounted), which
respects the Explorer header toggle (`scrakk-studio:git-decorations`, **off by
default**). Priority is staged > unstaged > untracked; letters and colors are
`M` `#d29922`, `A`/`U` `#3fb950`, `D` `#f85149`, `R`/`C` `#58a6ff`.

For diffs, `gitApi.diffNumstat({ cwd, ref?, staged? })` returns per-file
added/removed counts. Diff **tabs** are opened through `@services/diff`
(`openDiffTab()`), which renders a `scrakk-diff://` read-only tab with provided
content and line-background decorations; a git provider plugs into that API. The
panel itself opens files as normal tabs.

## Underlying service

`gitApi` (`@services/git/api.ts`) is a thin typed `Proxy` over `api.git`.
Real validation and argv live in `src/main/ipc/git.ts`; the channels are declared
in `src/shared/git.ts` (`git:status`, `git:log`, `git:reflog`, `git:diff-numstat`,
`git:show-commit`, `git:stage`, `git:unstage`, `git:discard`, `git:commit`, …).
Every mutation notifies via `@services/notifications` and refreshes the store
(`mutate()`); a failed mutation also records `state.error`.

## Limits

| What | Status |
|---|---|
| Multi-repo detection and switching | ✅ |
| Per-file and bulk staging/unstaging, lasso staging | ✅ |
| Commit (staged) and commit-all, history, branches, stash, tags, remotes | ✅ |
| Auth (gh token / HTTPS helper), SSH probe, PRs | ✅ |
| Git badge decorations in the Explorer | ✅ via provider (default off) |
| Open a diff tab from a changed file | 🟡 `diffNumstat` exists; the panel opens the file, diff tabs come from `@services/diff` |
| Amend from the panel | 🟡 `amend` is supported by the API; there is no UI button |
| Hunk-level staging, conflict-resolution UI | ❌ |

## Next steps

- [Explorer](explorer.md) — the tree the changes view is built from.
- [Search](search.md) — the other workspace-wide panel.
- [Panels](../extensions/guides/panels.md) — the panel contract and header actions.
- [Extensions](../extensions/README.md) — contributions that can extend the app.
