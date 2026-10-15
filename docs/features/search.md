---
title: "Search"
group: features
order: 30
summary: "The Search panel: grep the workspace from the renderer, the result list, and the kolargrep sidecar / native / TypeScript fallback chain in main."
---
# Search

The Search panel (`search` panel) runs a **content grep** over the workspace root
and lists matching lines. It talks to one IPC channel — `fs:search-in-files` —
whose main-process handler tries a live `kolargrep serve` sidecar first, then a
native addon, then a TypeScript scan.

## Searching

The panel reads the same root as the Explorer (`scrakk-studio:root-path`,
following the `workspace-changed` event). Typing debounces by
`DEBOUNCE_MS = 250` ms and sends one request, guarded by a generation counter so
stale answers are dropped:

```ts
// src/renderer/src/features/layout/panels/SearchPanel/SearchPanel.tsx
const MAX_RESULTS = 100
const res = await window.api.fs.searchInFiles(root, query, undefined, false, MAX_RESULTS)
//  fs.searchInFiles(root, query, includePattern?, caseSensitive?, maxResults?, regex?)
```

The `query` is **literal by default**; pass `regex = true` to treat it as a
ripgrep regular expression. An invalid regex returns a clear error instead of an
empty list. (Before, the sidecar/addon backends treated the query as regex while
the TypeScript fallback used `includes`, so the result depended on which backend
was built — `chr(10)` matched `chr10` and a lone `\` failed silently.)

The panel always passes `includePattern = undefined`, `caseSensitive = false` and
`maxResults = 100`. When another caller lets the handler use its own default,
`maxResults` falls back to `50`; the UI then shows a `(tope)` marker when a page
comes back full.

## Results

Each match is a `GrepMatch` (`src/shared/fs.ts`):

```ts
interface GrepMatch {
  file: string
  line: number
  column?: number
  content: string
  preview?: string
  columns?: number[]              // 1-based columns of every hit on the line
  spans?: Array<[number, number]> // byte ranges [start, end] of each hit
}
```

The list shows the basename, `:line` and the line preview. When `spans` are
present the panel splits the line **by bytes** (`TextEncoder` / `TextDecoder`) and
wraps the hits in `<mark>` — cutting by characters would break with accents or
emoji. Clicking a result calls `openFileInEditor(m.file, baseNameOf(m.file))`;
the panel does **not** move the cursor to the matching line.

## The main-process chain

`FS_IPC.searchInFiles` (`'fs:search-in-files'`, handled in `src/main/ipc/fs.ts`)
tries, in order:

1. **Sidecar `kolargrep serve`** — `sidecarGrep(root, query, caseSensitive, maxResults)`
   sends a JSON-RPC request over TCP with
   `{ pattern, case_insensitive, max_count, detail: true, positions: true }` and
   returns `columns` and `spans`.
2. **Native addon `scrakk-search`** (Rust + `kolargrep-core` via NAPI) —
   `tryNativeGrep(root, query, caseSensitive, maxResults)`.
3. **TypeScript scan** — a recursive read of text files under `root`.

Each layer returns `null`/throws to fall through, so a missing binary never breaks
the feature.

### Sidecar lifecycle

`src/main/search/kolargrepServer.ts` spawns
`kolargrep serve <root> --index-path <indexDir>` once per root and speaks one JSON
object per line. Details:

- Index dir: `$XDG_CACHE_HOME/scrakk-search-serve/<sha256(root).slice(0,16)>`
  (outside the project, so the repository stays clean).
- The server writes `serve.json` (PID + port); the client verifies the PID is
  alive before reusing it.
- Idle shutdown after **5 minutes** without searches; override with
  `SCRAKK_SEARCH_IDLE_MS` in ms (`0` disables). The on-disk index survives, so the
  next search restarts fast.
- Binary candidates include `native/kolargrep/target/release/kolargrep` (the dev
  checkout). `stopKolargrepServers()` runs at app exit.

```bash
# build the sidecar from the repo root
cargo build --release --manifest-path native/kolargrep/Cargo.toml
```

### Native addon and TS fallback

`getNativeSearch()` loads `native/search/{scrakk-search,index}.linux-x64-gnu.node`
(also from `app.asar.unpacked` in packaged builds) and never throws — if it is
missing or fails to load, the TS scan runs. That scan skips common directories
(`node_modules`, `.git`, `dist`, `__pycache__`, `.venv`, `coverage`, …), only
reads known text extensions, ignores files above `maxFileSize` (default `1 MB`)
and stops at `maxResults`.

`ensureWatch(root)` starts the native incremental watcher once per process; the
sidecar's own watcher keeps its trigram index fresh.

## Other consumers

The agent's `grep_search` tool calls the same channel
(`src/renderer/src/services/ai/tools/grep_search/executor.ts`), so the panel and
the agent share one search stack. A separate channel, `fs:search-files`, lists
**file names** (quick-open style lookups) and is unrelated to content grep.

## Limits

| What | Status |
|---|---|
| Content grep with byte-accurate highlights (`spans`) | ✅ (sidecar / native) |
| Result list capped in the UI at `MAX_RESULTS = 100` | ✅ |
| Fallback chain sidecar → native → TS | ✅ |
| Case-insensitive only in the panel (`caseSensitive = false`) | 🟡 IPC supports the flag; there is no UI toggle |
| Include/exclude pattern from the panel | ❌ `includePattern` is always `undefined` |
| Open a result **at the matching line** | ❌ opens the file only |
| Regex toggle | ❌ the TS fallback is a literal `includes`; pattern semantics are up to the sidecar |

## Next steps

- [Explorer](explorer.md) — the tree that defines the workspace root.
- [Git](git.md) — another workspace panel and its decorations.
- [Panels](../extensions/guides/panels.md) — how a panel like Search is mounted.
- [The editor](../editor/editor.md) — tabs opened from a result.
