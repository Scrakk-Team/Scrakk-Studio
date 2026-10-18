---
title: "Explorer"
group: features
order: 20
summary: "The workspace file tree: lazy folders, virtualization, multi-selection, lasso, drag & drop, file-icon themes and git-aware badges."
---
# Explorer

The Explorer is the workspace file tree (`explorer` panel, permanent — no X in the
header). It is a lazy, virtualized tree over a single root path with inline
create/rename/delete, native drag & drop and VS Code-style file decorations. The same tree is reusable as `ExplorerView` on any root; the Git panel embeds it for its changes view.

## Opening a workspace

The root is stored in `localStorage` under `scrakk-studio:root-path`. Any module
can change it via `setWorkspaceRoot(path)` (the empty-state button calls
`api.fs.pickFolder()`); a `workspace-changed` `CustomEvent` tells every
mounted Explorer (and other listeners) to follow.

```ts
import { setWorkspaceRoot, getWorkspaceRoot } from '@features/explorer'

getWorkspaceRoot()          // string | null — persisted root
setWorkspaceRoot('/repo')   // persists + dispatches 'workspace-changed'
```

## Expanding and loading

Folders start collapsed with `children: null`. Expanding calls
`api.fs.readdir(dir)` (name + type, no per-entry `stat`) and caches the
result; large directories are inserted in `BATCH_SIZE = 400` chunks with
`requestAnimationFrame`. Each loaded, expanded folder is watched
(`api.fs.watchDir`) and re-read when `fs.onWatchChanged` fires. Metrics are
fixed in `constants.ts`:

| Constant | Value | Meaning |
|---|---|---|
| `ROW_HEIGHT` | 22 | Row height in px (fixed → simple virtualization) |
| `ROW_FONT_SIZE` | 12 | Row text |
| `ROW_ICON_SIZE` | 16 | Icon |
| `ROW_INDENT` | 12 | Indent per level |
| `VIRTUAL_BUFFER` | 10 | Extra rows rendered above/below the viewport |
| `BATCH_SIZE` | 400 | Chunk size for large directories |

Only the visible window (± buffer) is rendered (`useWindowedRows`), so a root with
tens of thousands of files stays cheap. `useWorkspaceState` exposes `collapseAll()`,
`refresh()` and `refreshNode(dir)`.

## Selecting files

`useFileSelection` keeps a `Set<string>` of selected paths:

- **Click** a file → select it *and* open it in the editor; click a folder →
  toggle its expansion.
- **Ctrl/Cmd+click** → toggle that row in the selection (multi-select).
- **Shift+click** → range select over the flattened visible list.

The header exposes namespaced actions: `explorer.new-file`, `explorer.new-folder`,
`explorer.git-badges`, `explorer.collapse-all` and `explorer.refresh`. They are
`HeaderActionButton`s, so the user can drag them into a different order.

Inline editing: the "…" button opens the row context menu (open, share, rename,
delete, reveal, copy path, viewer ⇄ text toggle); `F2` renames and `Delete`
deletes the selection. Creating shows a ghost row with an inline input.

## Lasso (rubber-band) selection

Dragging on the tree background paints a selection box (`useSelectionBox`). It is
DOM-direct during the drag (no React state) and commits on `mouseup`; the geometry
is pure math over the fixed row height (`lassoRowRange` adds a ±2 row margin).
Holding **Ctrl/Cmd** makes it additive. A consumer can override the drop behavior
with `onLasso(paths, { select, additive })` — the Git panel uses this to *stage*
everything the box sweeps.

## Drag & drop

The Explorer uses native HTML5 drag. Starting a drag publishes the resource with a
private MIME so tab zones can accept it:

```ts
import { setResourceDragData, RESOURCE_MIME } from '@features/dnd'
// RESOURCE_MIME = 'application/x-scrakk-resource'
setResourceDragData(event.dataTransfer, [
  { kind: node.isDirectory ? 'folder' : 'file', path: node.path, name: node.name }
])
```

- **Internal move**: dropping onto a folder (or the tree background = root) moves
  the dragged paths there via `workspace.moveInto`; a path cannot be dropped into
  itself or a descendant (`isWithin`).
- **Drop onto tabs**: the layout reads `RESOURCE_MIME` and opens a file as a tab
  (a folder can spawn another explorer). `text/plain` carries the path as fallback.

## File-icon themes

`FileTypeIcon` resolves an icon in two layers:

1. The active theme from `@services/fileIcons` (`useFileIconUrl`) — a data URI
   contributed by extensions (`contributes.fileIcons`). Resolution priority is
   `fileNames` > `folderNamesExpanded` > `folderNames` > `fileExtensions` >
   `languageIds` > defaults (`file` / `folder` / `rootFolder`). The active theme id
   is persisted under `scrakk:active-file-icon-theme`.
2. A `ProductIcon` fallback by extension: `.ts`/`.tsx`/`.rs`/`.go` → `code`,
   `.sh`/`.zsh` → `terminal`, `.sql` → `database`, `.md`/`.json` → `file-text`,
   folders → `folder` / `folder-opened`. Dotfiles (`.gitignore`, …) map too.

A theme with `hidesExplorerArrows: true` lets the Explorer hide its chevrons.

## Git-aware badges

Rows can show a decoration badge (`A`/`M`/`D`/`R`/`U`) from any
`FileDecorationProvider`. `GitDecorationsBridge` registers one globally; it reads
the active repo's status and respects the Explorer header toggle, persisted under
`scrakk-studio:git-decorations` (**default off**).

```ts
import { registerFileDecorationProvider } from '@features/explorer'

const dispose = registerFileDecorationProvider((absPath) => (
  absPath.endsWith('.md') ? { badge: 'M', color: '#d29922' } : null
))
```

The Git panel reuses this tree with `visiblePaths` filtered to changed files, so
the changed ancestors auto-expand (`ancestorDirs` + `ensureExpandedMany`).

## Reusing the tree

`ExplorerView` mounts the same tree on an arbitrary root with no Git knowledge:

```tsx
<ExplorerView
  root={absPath}
  interactive={false}          // read-only: no menus/dnd, selection still works
  visiblePaths={changedPaths}  // show only these + their ancestors
  rowActions={(node) => [...]} // hover buttons (the Git +/×)
  onLasso={(paths, { select, additive }) => select(paths)}
  onSelectionChange={(paths) => setSelected(paths)}
/>
```

## Limits

| What | Status |
|---|---|
| Lazy loading, watcher-driven refresh, virtualization | ✅ |
| Multi-select, Shift range, lasso (with Ctrl/Cmd additive) | ✅ |
| Native drag & drop: move inside the tree, drop onto tabs | ✅ |
| File-icon themes from extensions + fallback icons | ✅ |
| Git badges (provider registry + header toggle) | ✅ |
| Two roots at once in the same window | 🟡 one persisted root; use `rootOverride` / `ExplorerView` to show another |
| Open a Search hit **at its line** | ❌ Search opens the file only (see [search.md](search.md)) |

## Next steps

- [Search](search.md) — grep the workspace and open hits from the result list.
- [Git](git.md) — status, staging and the changes tree built on this tree.
- [Panels](../extensions/guides/panels.md) — the panel contract and layout slots.
- [The editor](../editor/editor.md) — where opened files land.
