---
title: "LSP system architecture"
group: lsp
order: 30
summary: "How the LSP layers connect: renderer → preload → main → servers, with multi-root routing and each client's lifecycle."
---
# LSP system architecture

The renderer asks over IPC, the **main** process orchestrates, and each language
server runs as a **child process** (or over TCP). This is the whole picture.

## Layers

The processes, top to bottom:

```
┌──────────────────────────────────────────────────────────────┐
│ RENDERER (sandbox)                                            │
│  services/lsp/api.ts          ← typed ops + generic request   │
│  services/lsp/diagnosticsStore← reactive multi-server cache   │
│  services/lsp/format.ts       ← <lsp-diagnostics> block       │
│  services/ai/tools/lsp/       ← the agent's 'lsp' tool        │
└───────────────▲──────────────────────────────┬───────────────┘
                │ push events                   │ invoke
┌───────────────┴──────────────────────────────▼───────────────┐
│ PRELOAD (contextBridge): api.lsp                       │
└───────────────▲──────────────────────────────┬───────────────┘
                │                              │
┌───────────────┴──────────────────────────────▼───────────────┐
│ MAIN — src/main/lsp/index.ts (IPC handlers + broadcast)       │
│  manager.ts: roots · routing · clients · drain · restart      │
│  client.ts : JSON-RPC connection to each server (real child)  │
│  config/routing/builtinServers/install                        │
└───────────────┬───────────────────────────────────────────────┘
                │ stdio / TCP (JSON-RPC 2.0, Content-Length)
        ┌───────▼────────┐
        │ language server │  ← one child process per `name@root`
        └────────────────┘
```

The renderer runs sandboxed: it **never** touches processes. Every operation goes
over IPC; push events (diagnostics, server status, progress) are broadcast to all
live windows.

## A client's lifecycle

A client is born **lazy** (only when a file is touched or there is a request),
goes through the handshake and dies in an orderly way. The steps:

1. **Lazy start**: only when a file is touched or a request is made.
2. `resolveOrInstall`: binary in PATH → managed binary
   (`~/.scrakk/lsp/{bin,npm}`) → install recipe from the catalogue/extension.
3. **Handshake**: `initialize` with a timeout (15 s default) → `initialized` →
   `workspace/didChangeConfiguration` if there are settings.
4. **Negotiation**: if the server declares `textDocumentSync.change = 2`, the
   client enables incremental sync for that server.
5. **Use**: didOpen/didChange(versioned)/didSave on each sync; requests with a
   timeout (30 s default). If the `content` is **identical** to the last synced
   one, the `didChange` is NOT sent (in LSP a change without `range` replaces the
   whole document, so an empty change DELETES it on the server).
6. **Ordered shutdown**: didClose of all → `shutdown` → `exit` with a timeout
   (5 s default) → kill the child.
7. **Idle shutdown**: if it is left with no open documents for 5 min
   (`SCRAKK_LSP_IDLE_MS`), it turns itself off; the next file in that language
   brings it back up (lazy).

## Multi-root

- `setWorkspace(root)` resets to ONE primary root.
- `addWorkspaceRoot/removeWorkspaceRoot` add/remove extra roots.
- Each root loads its own config layers (see
  [configuration.md](configuration.md)); the user layer is global, the project
  layer is `<root>/.scrakk/lsp.json`.
- **File ownership**: a file belongs to the deepest root that contains it as a
  path prefix; fallback to the primary.
- Servers are instances per `(name, root)` pair — internal key `name@root`. The
  same name can run in two roots with different processes and different configs.

## Diagnostics: PULL (and push as fallback)

- **Pull is the normal path** (`textDocument/diagnostic`, LSP 3.17): the client
  announces `textDocument.diagnostic` in `initialize` and, if the server returns
  `diagnosticProvider`, the server is the one asking. It is not a style
  preference: the **CSS/HTML/JSON** servers choose their WHOLE validation mode
  with that capability — with push they use `validationDelayMs = 500` **fixed**
  (and every change restarts the timer, so an edit within that window CANCELS
  validation: the error you just typed is never marked), and with pull
  `validate(document)` runs **without waiting** (`registerDiagnosticsPullSupport`).
  Measured in the compiled app (`tools/_probe-lsp-order.mjs`): **+185 ms** from the
  last keystroke to the diagnostic, versus +636 ms with push; and while typing the
  errors arrive in streaming (~180 ms) instead of waiting for you to stop.
- The pull rhythm is set by `PULL_MIN_INTERVAL_MS` (180 ms per document, with a
  leading edge): the first change after a pause goes out RIGHT AWAY and a burst is
  grouped — there is no request per keystroke. The renderer already coalesces at
  40 ms (`services/lsp/fileSync.ts`).
- **Push is still supported and is the fallback**: `publishDiagnostics` is always
  declared, and servers without `diagnosticProvider` (old
  typescript-language-server, etc.) work as before. If a server announces pull and
  answers `MethodNotFound`, the client **turns pull off for that session** and
  continues with push (escape valve: without it, a wrong capability would leave
  files without diagnostics forever).
- Both paths end in `applyDiagnostics` → a map by absolute path inside the client
  + broadcast to the renderer (`lsp:on-diagnostics`), so the editor does not know
  or care how it arrived.
- **With pull, the server no longer notifies anything on document change**: the
  only notice left is `workspace/diagnostic/refresh` (the server asks to
  re-query) and there the open documents are re-requested. On closing a document,
  the `[]` is sent by the client (with push the server sent it).
- Debugging this chain: `SCRAKK_LSP_DEBUG=1` in the main process prints each
  `notify` (version, length, queue) and each diagnostics arrival with its origin
  (`push`/`pull`). It is the quick way to answer "where did this come from and
  with what text?".
- After an edit (`notifyFileChanged`), the manager marks pending by
  `(client, lifecycle_id)`.
- `drainDiagnostics(timeout)` waits until **all** servers with pending work have
  published (presence, not length: a "no errors" counts as reported), merges
  multi-server ERROR/WARNING and clears the state. When the deadline expires it
  returns what arrived and keeps what is missing.
- After an edit (`notifyFileChanged`), the manager marks pending by
  `(client, lifecycle_id)`.
- `drainDiagnostics(timeout)` waits until **all** servers with pending work have
  published (presence, not length: a "no errors" counts as reported), merges
  multi-server ERROR/WARNING and clears the state. When the deadline expires it
  returns what arrived and keeps what is missing.

## Restart-on-crash

- If the config asks for it (`restartOnCrash: true`):
  - detection by process exit/connection close,
  - exponential backoff 1 s → 30 s,
  - lifetime budget `maxRestarts` (default 3),
  - after restarting: a **replay** of documents (re-read from disk, reopen,
    re-enqueue diagnostics).
- Without the flag: it stays `crashed` until the host touches it again.

## Requests

Two ways to ask:

| Mode | How |
|---|---|
| Per file | `filePath` → opened in its server(s) and routed there |
| Broadcast | `broadcast: true` → all running ones |
| Targeted | `serverName` → exactly that server (completionItem/resolve) |

Results arrive as `results[]` with one entry per server
(`{ serverName, result?, error? }`); individual errors do not crash the rest.
