---
title: "Project structure"
group: start
order: 40
summary: "Repository layout of Scrakk Studio: the three processes (main, preload, renderer), the shared contracts, and the langs/, tools/, tests/, docs/ and native/ folders."
---
# Project structure

Scrakk Studio is an Electron app: a **main** process, a **preload** bridge and a
**renderer** (React + the Innerta editor). A fourth layer, **shared**, holds the
contracts both processes compile against. The `package.json` `main` field points
at `./out/main/index.js`.

## Top level

| Path | What lives there |
|---|---|
| `src/main` | Electron main process: FS, LSP, extensions, LLM, updates |
| `src/preload` | `contextBridge` surface exposed to the renderer |
| `src/renderer` | UI (React) and the bridges into the engine |
| `src/shared` | Contracts and pure logic shared by main and renderer |
| `langs/` | Language pack: one folder per language + `index.json`, `manifest.json` |
| `tools/` | CLIs: docs, i18n, SEF, grammar, bump, perf, pack audit |
| `tests/` | Vitest suite |
| `docs/` | Documentation and changelog (`docs/backend/*.sql` is not published) |
| `native/` | Rust / N-API code (`search`, `kolargrep`) and `copy-node.mjs` |
| `build/` | `electron-vite.{base,dev,prod}.ts` build profiles |
| `build-resources/` | Packaged icons (`electron-builder.yml` `buildResources`) |

Root files that matter: `electron.vite.config.ts` (wrapper that picks the dev or
prod profile by `NODE_ENV`), `electron-builder.yml`, `vitest.config.ts`, and the
three tsconfigs (see below).

## Processes

### `src/main`

The Node/Electron side. Grouped by domain: `ipc/` (the handlers behind
`window.api`), `lsp/`, `extensions/` (including `host/` and `treeSitter/`),
`llm/`, `models-dev/`, `search/`, `account/`, `social/`, `web/`, `windows/`,
`encodings/`, `fonts/`, `images/`, `perf/`, `scrakk/`. Entry point:
`src/main/index.ts`. Auto-update lives in `app-updates.ts` and
`auto-updater.ts`; the ordered quit is in `shutdown.ts`.

### `src/preload`

`index.ts` builds the bridge object and `index.d.ts` types it for the renderer.
This is the only door between the two processes.

### `src/renderer`

`public/` ships static assets (`innerta/innerta.wasm`, `fonts/`, `logo/`).
`src/` is the application:

| Folder | Role |
|---|---|
| `app/` | `App.tsx`, the composition root |
| `features/` | UI: React components, hooks and panels |
| `services/` | Non-React singletons, state stores and adapters |
| `core/` | Cross-cutting primitives (`theme`, `i18n`, `perf`, `feedback`, `zoomGuard`) |
| `components/` | Shared components: `layout/` (shell) and `ui/` (generic) |
| `styles/` | `global.css` and token resets |

## features vs services vs shared

This is the layering the code follows:

- **`features/*`** — the **view**. React components and hooks that render a
  panel, modal or widget. They may import services, `core`, `components` and
  `@shared`.
- **`services/*`** — framework-agnostic **state and integration**. Singletons
  and stores with no JSX (LSP client state, extension registry, command
  registry, storage, providers). They exist so non-React subsystems (commands,
  extensions, the agent) can read/write state. Example: providers expose both a
  React context (`state/`) and a plain module (`features/providers/settings.ts`)
  that reads the persisted `scrakk-studio:providers` value.
- **`core/*`** — primitives used across features and services: theme provider
  and tokens, i18n runtime, perf marks, feedback, the page-zoom guard.
- **`src/shared/*`** — **contracts** compiled into both processes: `fs.ts`,
  `lsp.ts`, `git.ts`, `permissions.ts`, `llm.ts`, `terminal.ts`, `updates.ts`,
  `i18n/`, `syntax/`, `compatibility/`, `extensionHost/protocol.ts`. No React and
  no Electron imports here.

## Aliases and tsconfigs

The project is a TypeScript project-references build. `tsconfig.json` references
`tsconfig.node.json` (main + preload + shared) and `tsconfig.web.json` (renderer
+ shared). The web config defines the path aliases:

```jsonc
"paths": {
  "@shared/*":   ["./src/shared/*"],
  "@core/*":     ["./src/renderer/src/core/*"],
  "@ui":         ["./src/renderer/src/components/ui/index.ts"],
  "@ui/*":       ["./src/renderer/src/components/ui/*"],
  "@layout/*":   ["./src/renderer/src/components/layout/*"],
  "@features/*": ["./src/renderer/src/features/*"],
  "@services/*": ["./src/renderer/src/services/*"]
}
```

The node config only defines `@shared/*`.

## Limits

- The **main process cannot import renderer code**: `tsconfig.node.json` only
  exposes `@shared/*`, and the renderer cannot import from `src/main` either.
  Anything both need must live in `src/shared`.
- `docs/backend/` (SQL migrations) is excluded from the published bundle
  (`EXCLUDE_DIRS` in `tools/docs/build.mjs`).
- `native/` is optional: without the compiled search `.node`, the search path
  falls back to TypeScript, and the `kolargrep` sidecar is only an optimization.
- `build-resources/` and `release/` are git-ignored; the icon inputs are not in
  the repository.

## Next steps

- [Install](install.md) — run from a release or from source.
- [Contributing](../dev/contributing.md) — scripts, tests, i18n and docs.
- [How it works](../extensions/architecture/overview.md) — boot and the
  extension registry.
