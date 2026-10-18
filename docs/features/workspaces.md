---
title: "Workspaces"
group: features
order: 230
summary: "Opening a folder, the single persisted workspace root, the recent-workspaces history in the titlebar, and how the root feeds the Explorer, LSP and .scrakk config."
---
# Workspaces

A **workspace** is the folder Scrakk Studio has open. There is exactly **one active root** at a
time; the app remembers recent roots as a switchable history (the ‹ › control in the titlebar).
The root is the anchor the Explorer walks and that project-scoped services (LSP, `.scrakk`
config, AI tools) read to know which project they are in.

## The workspace root

The root lives in `localStorage` under the raw key `scrakk-studio:root-path` (not the
`scrakk:`-prefixed storage service). Two functions in `features/explorer` are the public API:

```ts
import { getWorkspaceRoot, setWorkspaceRoot } from '@features/explorer'

getWorkspaceRoot()            // string | null — the persisted root
setWorkspaceRoot('/repo')     // persists and dispatches 'workspace-changed'
```

`setWorkspaceRoot(path)` writes the key and dispatches a `workspace-changed` `CustomEvent`
with `{ path }`. Every mounted Explorer listens and follows, so opening a folder from the
empty state, the titlebar widget, a command or a menu all take the same path. `getWorkspaceRoot`
is a pure read used outside React (for example to declare the workspace jail to the Extension
Host and to feed per-account presence).

## Opening a folder

- **Empty state**: the Explorer's button calls `api.fs.pickFolder()` and then
  `setWorkspaceRoot(path)`.
- **Titlebar widget** (`WorkspacesWidget`): shows the active folder's real base name
  (`baseNameOf`), a ‹ / › pair to step through the history, and a **+** to pick a folder. The
  name opens the history popover (`WorkspacesHistoryPanel`).
- Any module can call `openFolder()` from `useWorkspaceState`, which wraps `pickFolder` and
  `setRootPath`.

```ts
import { setWorkspaceRoot } from '@features/explorer'

const res = await api.fs.pickFolder()
if (res.success && res.path) setWorkspaceRoot(res.path)
```

## The recent-workspaces history

`@services/workspaces` (`services/workspaces/history.ts`) keeps a bounded, de-duplicated list:

| Item | Value |
|---|---|
| Storage key | `scrakk-studio:workspaces-history` |
| Active root key | `scrakk-studio:root-path` (shared with the Explorer) |
| Capacity | `MAX_HISTORY = 20` (newest first, old ones dropped) |

```ts
import {
  listWorkspaces, getActiveWorkspace, recordWorkspace,
  prevWorkspace, nextWorkspace, baseNameOf, subscribeToWorkspaces
} from '@services/workspaces'

recordWorkspace('/repo')        // de-dupes, moves to front, emits only if changed
listWorkspaces()                // string[] (newest first, read-only copy)
getActiveWorkspace()            // the root-path value, or the last recorded path
prevWorkspace(current) / nextWorkspace(current)
```

The service auto-registers: at import time it listens for `workspace-changed` and calls
`recordWorkspace(path)`, so opening a folder anywhere enters the history without extra code.
`baseNameOf` returns the last path segment (handles `/` and `\`, strips trailing slashes).
Opening a history row calls `recordWorkspace(path)` then `setWorkspaceRoot(path)`.

## How the root feeds the rest of the app

- **Explorer**: `useWorkspaceState()` reads `scrakk-studio:root-path`, builds a lazy tree and
  watches each expanded folder. A consumer can mount the same tree on another root with
  `useWorkspaceState(rootOverride)` / `ExplorerView` — that override is read-only and never
  rewrites the global root. See [Explorer](explorer.md).
- **Project config / LSP**: `scrakkProjectRoot()` reads the *same* `scrakk-studio:root-path`
  key, so `<root>/.scrakk` (and `lsp.json` inside it) always matches the open folder. See
  [The `.scrakk` folder](dot-scrakk.md) and [Server configuration](../lsp/configuration.md).
- **Presence**: the Social panel publishes only the project folder's base name from the root,
  never the full path (see [Social](social.md)).

## Adding and removing roots

The app is **single-root**. "Adding" a folder means picking it and switching the active root
(which also records it in the history); there is no renderer API to delete an entry from the
history — the list is only bounded by capacity. To show a second tree next to the first,
consumers pass `rootOverride` to the Explorer view; there is no simultaneous multi-root
workspace model.

## Limits

| What | Status |
|---|---|
| One active root, persisted across restarts | ✅ |
| Recent history (dedupe, newest first, cap 20), prev/next navigation | ✅ |
| Auto-registration on any `workspace-changed` | ✅ |
| Remove a workspace from the history | ❌ no API (only the 20-item cap) |
| Two roots open at once as a real workspace | 🟡 render another with `rootOverride` / `ExplorerView` |
| The active root is inferred from `localStorage`, not passed explicitly to main | 🟡 renderer resolves `projectRoot` and sends it with `.scrakk` calls |

## Next steps

- [Explorer](explorer.md) — the lazy tree the root drives.
- [The `.scrakk` folder](dot-scrakk.md) — per-project config under the root.
- [Server configuration](../lsp/configuration.md) — how the root selects LSP servers.
