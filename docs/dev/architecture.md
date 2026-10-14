---
title: "Architecture"
group: dev
order: 30
summary: "The app process model: main, preload, renderer and shared, the features/services/core split, the IPC boundary and how electron-vite builds it."
---
# Architecture

Scrakk Studio is an **Electron** app. The code is split into four areas that
compile as a TypeScript project-references build: the **main** process, the
**preload** bridge, the **renderer** (`src/renderer/src`) and **shared**
contracts. The renderer is a React app; the editor it hosts is the Innerta WASM
engine. This page is the map; the subsystem docs go deeper.

## The four areas

| Area | Entry point | What it is |
|---|---|---|
| `src/main` | `src/main/index.ts` | Node/Electron side: FS, LSP, extensions, the LLM fetch, terminal, git, updates |
| `src/preload` | `src/preload/index.ts` | The only bridge: builds `window.api` over `contextBridge` |
| `src/renderer/src` | `main.tsx` → `app/App.tsx` | React UI, services and the Innerta bridges |
| `src/shared` | — | Contracts and pure logic compiled into both processes |

`package.json` points `main` at `./out/main/index.js`. The main process groups
its handlers by domain under `src/main/ipc/` (`fs`, `llm`, `terminal`, `git`,
`extensions`, `extension-host`, `screenshot`, `window-controls`) plus `lsp/`,
`llm/`, `extensions/`, `search/`, `web/`, `models-dev/`, `windows/`, `scrakk/`,
`encodings/`, `fonts/`, `images/` and `perf/`. The ordered quit (waking the token
flush, the extension hosts and the search servers before the process dies) lives
in the top-level `shutdown.ts`.

`src/shared` holds the IPC contracts the two sides compile against — `fs.ts`,
`lsp.ts`, `llm.ts`, `git.ts`, `terminal.ts`, `updates.ts`, `permissions.ts`,
`extensions.ts`, `i18n/`, `syntax/`, `compatibility/` and
`extensionHost/protocol.ts`. No React and no Electron imports live here.

## Renderer layering

Inside `src/renderer/src` the split is deliberate:

- **`features/`** — the **view**: React components, hooks and panels
  (`chat`, `editor`, `layout`, `explorer`, `git`, `settings`, `providers`, …).
  Features may import services, `core`, `components` and `@shared`.
- **`services/`** — framework-agnostic **state and integration**: singletons and
  stores with no JSX (`ai`, `chat`, `lsp`, `extensions`, `commands`, `skills`,
  `providers`, `storage`, …). They exist so non-React subsystems — commands,
  extensions, the agent — can read and write state.
- **`core/`** — cross-cutting primitives: `theme`, `i18n`, `perf`, `feedback`,
  `zoomGuard`.
- **`components/`** — `layout/` (the shell) and `ui/` (generic widgets).
- **`app/App.tsx`** — the composition root: it nests `ProvidersProvider` →
  `ChatsProvider` → `AppShell` and mounts the bridges (LSP notifications,
  updates, command palette, settings).

`main.tsx` is the boot sequence: it applies the startup theme and locale **before
the first paint**, then `bootExtensions()`, and defers the heavy LSP workspace
and file sync to `requestIdleCallback`.

## The IPC boundary

The renderer runs with **`contextIsolation` + `sandbox` and no
`nodeIntegration`**: it never touches processes. `src/preload/index.ts` builds
one `WindowApi` object and exposes it as `window.api`. Every call is `invoke`
(request/response) or `send`/`on` (events).

```ts
// main: handler registration
app.whenReady().then(() => {
  registerLlmIpc()
  registerFsIpc()
  registerLspIpc()
  registerExtensionsIpc()
  registerTerminalIpc()
  registerGitIpc()
  // …
})
```

```ts
// renderer: typical calls
await window.api.fs.readFile(path)
const off = window.api.llm.chatStream(request, { onContent, onDone, onError })
```

The LLM stream is the clearest example: the renderer registers the delta
listeners **before** `chatStreamStart` so no early chunk is lost, and `stopStream`
aborts the fetch in main, which resolves with the partial output instead of an
error. The renderer never talks to the Extension Host directly — main validates
and routes those requests. The Extension Host and the dynamic tree-sitter worker
are separate `utilityProcess.fork` children and therefore have their own bundle
entries (see the build config).

## Build

`electron.vite.config.ts` is a thin wrapper that picks a profile by `NODE_ENV`:
`build/electron-vite.dev.ts` or `build/electron-vite.prod.ts`, both extending
`build/electron-vite.base.ts`. The base defines the aliases (`@shared`, `@core`,
`@ui`, `@layout`, `@features`, `@services`), injects `__APP_VERSION__` from
`package.json`, and applies `externalizeDepsPlugin()` to main and preload so
Electron dependencies are not bundled.

The main build has **three entries**: `index.ts`, the Extension Host
(`extensions/host/entry.ts`) and the tree-sitter worker
(`extensions/treeSitter/entry.ts`). Dev pins the renderer to port **7080** with
`strictPort` (the Chromium origin partitions localStorage, so a changing port
would drop layouts and keys); prod minifies with **esbuild** and targets
`chrome120`.

```bash
npm run dev     # electron-vite dev, HMR on the renderer
npm run build   # electron-vite build + node native/copy-node.mjs → out/
npm run typecheck
```

TypeScript is a project-references build: `tsconfig.node.json` (main, preload,
shared) and `tsconfig.web.json` (renderer, shared).

## Where the subsystems live

| Subsystem | Main | Renderer |
|---|---|---|
| Editor (Innerta) | — | `features/editor/**`, `services/innerta/**` |
| Chat + agent | `llm/` (the fetch) | `features/chat/**`, `services/chat/**`, `services/ai/**` |
| LSP | `lsp/` (manager, clients) | `services/lsp/**`, `features/lsp/**` |
| Extensions (SEF) | `extensions/**`, `ipc/extensions.ts` | `services/extensions/**` |
| Terminal | `ipc/terminal.ts` (node-pty) | `features/layout/panels/…` |

See [How it works](../extensions/architecture/overview.md) for the extension
loader, [LSP architecture](../lsp/architecture.md) for the language client, and
[Innerta as a surface](../editor/innerta-bridge.md) for the editor engine
contract.

## Limits

- The **main process cannot import renderer code and vice versa**; anything both
  need must live in `src/shared`, which must stay free of React and Electron.
- The preload surface (`window.api`) is large and manual; every new IPC group is
  a new entry there and in `index.d.ts`.
- The renderer is sandboxed, so process-level work (LSP, terminal, search
  sidecars) always crosses IPC.
- Extension code never runs in the renderer: it runs in its own `utilityProcess`.
- `native/` is optional: without the compiled search addon the app falls back to
  the TypeScript search path.

## Next steps

- [How it works](../extensions/architecture/overview.md) — boot, loader, registry.
- [LSP architecture](../lsp/architecture.md) — renderer → preload → main → servers.
- [Innerta as a surface](../editor/innerta-bridge.md) — the editor contract.
- [Project structure](../getting-started/project-structure.md) — repository layout.
- [Contributing](contributing.md) — scripts, tests and CI.
- [SEF extensions](../extensions/README.md) · [LSP system](../lsp/README.md) · [Documentation index](../README.md)
