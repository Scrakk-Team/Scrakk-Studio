---
title: "Extension Host"
group: extensions
order: 310
summary: "The separate Node process that runs an extension's code (not an OS sandbox), how it talks to the IDE over RPC and what the main authorizes."
---
# Extension Host

An extension **with code** (`runtime` in the manifest) does not run in the
renderer: it runs in an **Extension Host**, its own Node process. The host
**knows no Electron and no UI**: only RPC, `require` and `console`. Everything
the extension wants from the world it asks for over RPC, and the **main** decides
(permissions, jail, routing).

```text
┌──────────────┐   IPC    ┌────────────────────────┐   RPC    ┌───────────────┐
│  renderer    │ ◄──────► │  main: ExtensionHost-   │ ◄──────► │  Host (Node)  │
│  (the UI)    │          │  Manager                │          │  your extension│
└──────────────┘          │  · authorizes (perms)   │          │  + vscode shim │
                          │  · storage, documents   │          └───────────────┘
                          │  · routes to the UI     │
                          └────────────────────────┘
```

## A process per extension

`ExtensionHostManager` (`main/extensions/hostManager.ts`) spawns **one Electron
`utilityProcess` per extension** that needs it (`ensureHost`). It is separated
from the renderer and has no access to the UI. The host runs under Node's
permission model (`--permission`): filesystem access is limited to the package,
storage, temp and the workspace (per `fs.read`/`fs.write`), and
`child_process` requires `shell.exec`; native addons are denied. **Network is
not restricted** by Node's model, so an extension can still reach the internet.
UI bundles are a separate story: they run in the renderer until migrated to
webview contributions, but they no longer receive `window.api` (the bridge is
taken once by `services/api.ts` at boot). `spawnHost` is the seam: if the execution
runtime changes, you replace **that** function and keep everything else.

## Lifecycle

1. **`init`** — the main resolves **before** starting: storage paths, global and
   workspace state, configuration, and the package's `package.json`. The host
   does not touch disk or decide paths: it receives everything ready-made.
2. **`ready`** — the host greets; if it does not greet within 10 s, it is cut off
   with a clear error.
3. **`activate(context)`** — runs once. **No timeout** (like VS Code): a large,
   slow extension is not falsely marked as "failed". There is a heartbeat every
   **15 s** reporting what it is waiting for, so a hang is diagnosed, not guessed.
4. **`deactivate()`** — on disable/uninstall; the process is killed afterwards.

Activation is **single-shot**: two parallel `ensure` calls share the same run
(avoiding the classic "Host provider has already been initialized").

## The `vscode` module

The host builds the `vscode` the extension sees in `hostProcess.ts` +
`vscodeApi.ts` on top of a bridge. See
[Extension API](../reference/vscode-api.md) for the full surface.
`hostProcess.ts` intercepts `require('vscode')` (the only runtime-specific part;
injectable for tests).

## Protocol (RPC)

`host/rpc.ts` carries messages with a protocol version
(`HOST_PROTOCOL_VERSION`); `init` negotiates it and the host refuses to run if it
does not match. Two directions:

- **host → main** (requests + events): `fs/*` (read/write/stat/
  readDirectory/createDirectory/delete/rename/copy), `state/write`,
  `secrets/*`, `configuration/write`, `workspace/find`, `editor/open`, `notify`,
  `command/execute`, `host/open-external`; events `log`, `command/registered`,
  `view/html|title|post|tree`, `status/item`, `diagnostics/change`,
  `decorations/set`, `panel/open|update|close`, `fatal`.
- **main → host**: `init`, `activate`, `deactivate`, `provider/query`,
  `view/resolve|receive|dispose`, `tree/children|select`, `panel/dispose`,
  `command/execute`, `doc/*` (`open`/`change`/`save`/`close`/`active`),
  `env/telemetry`.

`setContext(key, value)` is resolved by the **main** (it is the first call an
extension awaits on activation) and notifies the UI, which feeds the `when`
clauses.

## The bridge (renderer)

`hostBridge.ts` is the renderer side of the host. It serves what only the UI knows
how to do:

- `notify` — shows the notification and **waits** for the chosen button
  (persistent when there are actions).
- `command/execute` — VS Code ids go through the compatibility map
  (`runVSCodeCommand`) and, if nobody has them, through the real IDE registry.
- `editor/open` — opens a file in the editor.

And it reflects the host events: `context/key` (`when` keys), `status/item`,
`diagnostics/change` (to the same store as the LSP), `decorations/set`
(underlines), `panel/open|update|close`, and `exit` (cleans items, panels,
diagnostics and decorations for that extension).

## Editor documents

`documents.ts` (renderer) synchronizes the editor with the host: `open`, `change`
(full text, with a 120 ms debounce), `save`, `close`, `active` + selection. It is
the source of `workspace.textDocuments`. The main keeps a snapshot and seeds it
into any host that starts later, so an extension sees the documents from
`activate`.

## Language providers

A language server can live in two places: in the `LspManager` (system server,
config in `.scrakk/lsp.json`) or **inside the host** (the extension started it
with `vscode-languageclient`, or provides the provider without a server).
`providerBridge.ts` is the bridge: the LSP IPC asks there and **adds** the hosts'
answers, without the `LspManager` knowing they exist.

## Storage and state

`extensionStorage.ts` (main) implements what VS Code asks for:
`globalState`/`workspaceState` (Memento), `secrets`, `configuration`, and the
`globalStorage`/`workspaceStorage`/`logs` directories. Those directories belong
to the extension and are **authorized** by the jail (see
[Permissions](../guides/permissions.md)).

## Environment and telemetry

`env` travels in `init` (appName, appRoot, language, machineId, shell,
`isTelemetryEnabled`, …). The telemetry setting is published by the renderer at
startup and on every change (`env/telemetry` fires `onDidChangeTelemetryEnabled`).
Scrakk **reports** the state of its setting; what the extension sends to its
server is its own consent.

## Next steps

- [Extension API](../reference/vscode-api.md) — what your code can call.
- [Permissions](../guides/permissions.md) — the deny-by-default model.
- [VS Code compatibility](vscode-compatibility.md) — from `.vsix` to SEF.
