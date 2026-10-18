---
title: "LSP system — Scrakk Studio"
group: lsp
order: 10
summary: "A full LSP client in the main process: completion, diagnostics, multi-root and multi-server for the editor and the agent."
---
# LSP system — Scrakk Studio

**LSP** (Language Server Protocol) is what gives the editor "code intelligence":
completion, go-to-definition, diagnostics, formatting… Scrakk includes a **full
LSP client** that runs in Electron's main process (shared contract → main runtime
→ preload bridge → renderer API).

## What it supports

- **Real multi-root**: N workspace folders, each file served with the config of
  the deepest root containing it. Instances `name@root`.
- **Multi-server routing**: a `.ts` can be served by the TS server AND a linter at
  the same time; the answers are merged.
- **Incremental sync**: if the server negotiates `change=2`, every edit sends only
  the diff (a range edit); automatic fallback to full text.
- **Push diagnostics** (`publishDiagnostics`) with a semantic drain: after an edit
  it waits for EVERY pending server to report.
- **Restart-on-crash** with exponential backoff, a lifetime budget and a real
  replay of documents from disk.
- **Auto-install** of servers via npm/go/gem/dotnet/GitHub/custom recipes.
- **Layered config**: `~/.scrakk/lsp.json` + `<root>/.scrakk/lsp.json` (the same
  format the CLI detects) + dynamic servers from SEF extensions + a builtin
  catalogue with auto-detection.
- **VS Code extensions with their own server**: the real `vscode-languageclient`
  library runs in the Extension Host, and its providers (hover, definition,
  references, formatting…) reach the editor through `provider/query` — the same
  `lsp:request` channel as the system servers (see
  [vscode-languageclient.md](vscode-languageclient.md)).
- **Diagnostics in the UI**: the LSP's and the extensions' share a store (one
  entry per source) and are listed in the **Problems** panel, with a counts chip
  in the status bar.
- **Diagnostics UNDERLINED in the editor**: the same store feeds the underline
  (wavy/dotted by severity, theme color) and the message on hover;
  `editor.setDecorations` from an extension enters the same channel (see
  [../editor/decorations.md](../editor/decorations.md)).
- **Servers turned off by the user**: Settings → Servers really turns them off
  (they do not start, and a running one is stopped).
- **Modern protocol**: `$/progress`, targeted `completionItem/resolve`, semantic
  tokens and inlay hints (declared capabilities).

## Index

| Doc | Content |
|---|---|
| [architecture.md](architecture.md) | Layers, data flow, lifecycle, multi-root |
| [configuration.md](configuration.md) | `.scrakk/lsp.json`: format, layers and priorities |
| [servers.md](servers.md) | Builtin catalogue, detection, auto-install |
| [api.md](api.md) | The full API for frontend/editor/agent tools |
| [protocol.md](protocol.md) | Details of the supported protocol and its limits |
| [extensions.md](extensions.md) | The `lspServers` contribution kind in SEF (and on/off from Settings) |
| [providers.md](providers.md) | Extensions' language providers: how they reach the editor |
| [vscode-languageclient.md](vscode-languageclient.md) | A VSIX with its `LanguageClient`: the REAL lib running in the Extension Host |
| [../editor/decorations.md](../editor/decorations.md) | How diagnostics (and decorations) are underlined in the editor |
| [testing.md](testing.md) | Test suite, mock server, how to run everything |

## In one line

The editor or the agent touches a file → the manager resolves which servers serve
it (by extension + root markers, in their owning root), starts them lazily,
synchronizes the buffer and exposes diagnostics/requests; the whole surface is
available through `api.lsp` (renderer, captured from the preload) and `@services/lsp` (renderer).

## Where the code lives

The file map:

```
src/shared/lsp.ts                  # IPC contract + types + shared parser
src/main/lsp/                      # runtime (main process)
├── client.ts                      # connection to ONE server (stdio/socket)
├── manager.ts                     # multi-root, routing, drain, restart
├── config.ts                      # layered .scrakk/lsp.json loading
├── routing.ts                     # nearest_root + resolve_servers
├── builtinServers.ts              # catalogue + detection
├── install.ts                     # auto-install recipes
└── index.ts                       # IPC handlers
src/main/scrakkFolder.ts           # .scrakk folder system (shared)
src/preload/index.ts               # api.lsp (services/api)
src/renderer/src/services/lsp/     # renderer public API
├── api.ts                         # typed ops + generic requests
├── diagnosticsStore.ts            # reactive multi-server cache
└── format.ts                      # <lsp-diagnostics> block
```
