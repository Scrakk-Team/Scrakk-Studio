---
title: "The LSP API — full surface for frontend/editor/agent"
group: lsp
order: 20
summary: "Three levels: api.lsp (renderer, captured once) · @services/lsp (renderer, typed and convenient) · the agent's lsp tool. Everything runs on the main-process runtime."
---
# The LSP API — full surface for frontend/editor/agent

The LSP API is in **three levels**, depending on who uses it:

- `api.lsp` — the captured bridge (`services/api.ts`).
- `@services/lsp` — typed and convenient, for the renderer (editor, panels).
- the `lsp` tool — for the agent.

Everything runs on the main-process runtime.

## Workspace and multi-root

Open the workspace root and add/remove extra roots:

```ts
import {
  setLspWorkspace,        // (rootPath) → the root's servers
  lspAddWorkspaceRoot,    // real multi-root
  lspRemoveWorkspaceRoot,
  lspListWorkspaceRoots
} from '@services/lsp'
```

`initLspWorkspaceSync()` (called from `main.tsx`) automatically syncs with the
root the Explorer opens (`workspace-changed` event).

## File sync

Tell the servers that a file changed or was closed:

```ts
lspNotifyFileChanged(path, content)  // didOpen | didChange | didSave
lspNotifyFileClosed(path)            // didClose on all servers
```

The client decides on its own: if it negotiated incremental sync it sends the
minimal diff; if not, full text. `content` is ALWAYS the full new content — the
diff is computed by the runtime.

**A `content` identical to the last synced one does NOT send `didChange`** (it does
send `didSave`). It is not an optimization: in LSP a change **without `range`**
means "replace the whole document with this text", so an empty change DELETES the
document on the server. It used to happen on save (the sync re-sent the same
content), and the server published 0 diagnostics: the underline and the chip were
cleared with the file still broken. Covered by `tests/lsp/incremental.test.ts`.

### The sync rhythm (renderer)

The editor calls `lspNotifyFileChanged` on **every** buffer revision
(`services/lsp/fileSync.ts`), with a **40 ms leading-edge window**: the first edit
of a burst goes out RIGHT AWAY and the rest is grouped. It is not a classic
debounce, which would wait for you to stop typing. Measured with
`tools/_probe-lsp-realtime.mjs` (real typing on the compiled app).

After that, **the LSP client waits for nobody**: it asks via pull
(`textDocument/diagnostic`, see `architecture.md`) with a 180 ms cap per document.
On the CSS/HTML/JSON servers that is the difference between their push
(`validationDelayMs = 500` fixed, which also restarts on every change) and
`validate(document)` with no wait. Measured on the compiled app with
`tools/_probe-lsp-order.mjs`: **+185 ms** from the last keystroke to the diagnostic
(before +636 ms with push), **+41 ms** to clear it on undo, and errors in streaming
while you type instead of a single one at the end.

## Diagnostics

Read the diagnostics the servers published (and wait for the pending ones):

```ts
// Waits for ALL pending servers (default 500 ms) and merges.
const files = await lspDrainDiagnostics(timeoutMs?)
// → FileDiagnostics[] { path, diagnostics: LspDiagnostic[] }

// Reads current diagnostics, opening the files if needed.
const entries = await lspReadDiagnostics(['/path/a.ts'])
```

### Reactive cache (store, MULTI-SOURCE)

A file's problems arrive through two channels: the LSP (`publishDiagnostics`) and
the Extension Host (an extension publishing into its `DiagnosticCollection`). The
store keeps **one entry per source** and the read merges, so an extension linter
and `tsc` do not overwrite each other.

```ts
import { getStoredDiagnostics, getProblems, getAllStoredDiagnostics,
         countProblems, subscribeToDiagnostics } from '@services/lsp'

getProblems('/path/a.ts')      // only ERROR/WARNING (code action context)
getAllStoredDiagnostics()      // everything, with `sources` (who published it)
countProblems()               // { errors, warnings, infos, total } — the chip
subscribeToDiagnostics(fn)     // live stream (both channels)
```

The UI consuming it is the **Problems** panel (layout, `problems`; opened by the
status-bar chip with the counts per severity). It can be opened in any slot:

```ts
toggleSlotPanel('bottom', 'problems')
```

What is NOT only seen in the panel: the same problems are underlined **inside the
text** (the engine's decoration channel, see `docs/editor/decorations.md`). Red
wavy = error, amber = warning, dotted = hint; the color comes from the theme and
hovering shows the message.

### The `<lsp-diagnostics>` block

What the agent receives after editing (sync + drain + formatting):

```ts
import { lspAfterEdit } from '@services/lsp/format'

// Post-edit hook: sync + drain(500ms) + CLI formatting.
// Already wired into write_file / replace_in_file / append_file.
const block = await lspAfterEdit(path, content) // string | null
```

Format (identical to the CLI): `<lsp-diagnostics>\npath:\n  error[L12]: msg\n</lsp-diagnostics>`
with escaping of closing tags inside messages.

## Generic requests

Ask for any LSP method by hand (the rest of the API are shortcuts over this):

```ts
const res = await lspRequest(method, params, {
  filePath?,     // routes to the file's servers (opens if needed)
  broadcast?,    // all running ones
  serverName?,   // ONE exact server (completionItem/resolve)
  timeoutMs?     // default 30s
})
// res.results: [{ serverName, result?, error? }]
```

## Typed operations (0-based positions, like the CLI)

Shortcuts for the editor's typical operations:

| Function | LSP method |
|---|---|
| `lspGoToDefinition/Implementation/TypeDefinition/Declaration` | textDocument/… |
| `lspFindReferences` | textDocument/references (includes declaration) |
| `lspHover` | textDocument/hover → contents per server |
| `lspDocumentHighlight` | textDocument/documentHighlight |
| `lspDocumentSymbol` | flat + flattened nested |
| `lspWorkspaceSymbol(query)` | broadcast |
| `lspCompletion(filePath,l,c)` → items **tagged** with serverName |
| `lspCompletionResolve(filePath, tagged)` | targeted completionItem/resolve |
| `lspSignatureHelp` | first active signature |
| `lspCodeAction(...)` | with real diagnostics from the store as context |
| `lspRename(...)` + `flattenWorkspaceEdit(edit)` | edits `file:l:c-l:c => newText` |
| `lspFormatting / lspRangeFormatting` | TextEdits per server |
| `lspPrepareCallHierarchy / IncomingCallHierarchy / OutgoingCallHierarchy` | call hierarchy |

## Semantic tokens and inlay hints

Extra data the editor paints with (per-token color, hints):

```ts
lspSemanticTokensFull(filePath)             // { data: number[], resultId? } | null
lspSemanticTokensRange(filePath, startLine, endLine)
lspInlayHints(filePath, startLine, endLine)
lspInlayHintResolve(hint)
```

**Highlight source choice** (storage system, no UI):

```ts
import { getPersistedHighlightSource, persistHighlightSource } from '@services/storage'
persistHighlightSource('lsp')        // 'treesitter' (default) | 'lsp'
```

Innerta must read this preference to decide between its Tree-sitter grammars or
painting the server's semantic tokens.

## Progress $/progress

The progress a server reports:

```ts
onLspProgress(({ serverName, token, phase, title, message, percentage }) => {})
// phase: 'begin' → 'report'* → 'end'
```

## Status and events

Runtime status and events to subscribe to:

```ts
lspStatus()  // [{ id: 'name@root', name, root, state, available, source, extensions }]
onLspServerEvent(cb)   // starting | ready | crashed | retrying | failed | stopped
onLspDiagnostics(cb)   // publishDiagnostics in real time
```

## The agent's `lsp` tool

A single tool with an `operation` enum (19 operations, 0-based positions):
goToDefinition, goToImplementation, findReferences, hover, goToTypeDefinition,
goToDeclaration, documentHighlight, documentSymbol, workspaceSymbol,
completion, codeAction, rename, signatureHelp, documentFormatting,
documentRangeFormatting, callHierarchyIncoming, callHierarchyOutgoing,
prepareCallHierarchy, diagnostics.

- Locations → `path:line:col`; symbols → `name @ path:line`.
- rename/codeAction return the edits so they can be applied with replace_in_file
  (they do not write on their own).
- The write tools inject `<lsp-diagnostics>` after editing — the agent sees its
  errors without asking for them.
