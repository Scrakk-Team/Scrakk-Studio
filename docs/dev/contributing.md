---
title: "Contributing"
group: dev
order: 10
summary: "Development setup, the npm scripts (dev, build, up, i18n, docs, sef), type checking, tests, the translation catalogs and the commit/versioning conventions."
---
# Contributing

This page covers the day-to-day loop: install once, pick the right npm script,
run the checks CI runs, and follow the commit and versioning conventions. All the
scripts below are defined in `package.json`.

## Setup

Requirements: **Node.js 22+** (the tooling imports `.ts` files directly via type
stripping). The workflows in `.github/workflows/` pin Node **24**.

```bash
git clone https://github.com/Scrakk/Scrakk-Studio.git
cd Scrakk-Studio
npm install       # postinstall downloads the Electron binary
npm run dev       # electron-vite dev with renderer hot reload
```

## npm scripts

| Script | Command | What it does |
|---|---|---|
| `dev` | `electron-vite dev` | Dev app with HMR on the renderer |
| `build` | `electron-vite build && node native/copy-node.mjs` | Production bundle in `out/` |
| `preview` | `electron-vite preview` | Preview the production build |
| `typecheck` | `tsc -b --pretty` | Type check both tsconfig references |
| `test` | `vitest run` | Full Vitest suite |
| `test:watch` | `vitest` | Watch mode |
| `dist` | `electron-vite build && electron-builder` | Installer into `release/` |
| `dist:dir` | `... electron-builder --dir` | Unpacked app only |
| `up` | `node tools/bump.mjs` | Bump version, commit, tag and push |
| `i18n` | `node tools/i18n.mjs` | Translation catalogs CLI |
| `i18n:extract` | `node tools/i18n-extract.mjs` | Find keys used in code |
| `pack:audit` | `node tools/pack-audit.mjs` | Inspect package contents |
| `perf:baseline` | `node tools/perf/baseline.mjs` | Bundle/anti-pattern baseline (no Electron) |
| `perf:baseline:runtime` | `... --runtime` | Baseline that also measures runtime |
| `native:build` | `napi build ... --cwd native/search` | Build the search addon |
| `native:kolargrep` | `cargo build --release -p kolargrep-cli ...` | Build the search sidecar |
| `native:copy` | `node native/copy-node.mjs` | Copy `.node` next to `out/main` |
| `desktop:install` | `node tools/desktop/install.mjs` | Install the Linux `.desktop` entry |
| `docs` | `node tools/docs/build.mjs` | Build `docs/.generated/` |
| `docs:init` | `... --init` | Write missing front-matter |
| `docs:check` | `... --check` | Validate front-matter and links |

## Type checking

```bash
npm run typecheck        # tsc -b --pretty  (equivalent to npx tsc -b)
```

`tsconfig.json` is a project-references root over `tsconfig.node.json` (main,
preload, shared) and `tsconfig.web.json` (renderer, shared). CI fails on any
type error.

## Tests

```bash
npm test                              # whole suite
npx vitest run tests/chat-loop.test.ts # one file
```

The suite uses Vitest with per-area files under `tests/` and helpers in
`tests/helpers/` (including a mock LSP server, `helpers/mock-lsp-server.mjs`).
The LSP suite is documented in [LSP system tests](../lsp/testing.md).

## Translations (i18n)

Model (see `tools/i18n.mjs`):

- **`es` is the base**, written by hand. Every other language is generated.
- A catalog is `src/shared/i18n/catalogs/<lang>/<area>.json` (flat key → text).
- Per-language state lives in `src/shared/i18n/state/<lang>.json` (source hash,
  whether it is machine-translated, whether it still needs review). `stale` is
  derived, never stored.
- `src/shared/i18n/catalogs/index.ts` is generated; it types `MessageKey` so a
  typo does not compile. Do not edit it by hand — run `npm run i18n -- --sync`.

```bash
npm run i18n -- --status                 # coverage per language
npm run i18n -- --extract                # keys used in code vs declared in es
npm run i18n -- --translate en --provider deepl
npm run i18n -- --review en              # markdown table for review
npm run i18n -- --approve en --all       # clear needsReview
npm run i18n -- --check [--strict]       # validate state
```

Translation uses DeepL by default (set `DEEPL_API_KEY` in `.env`; copy from
`.env.example`). `--provider argos` uses a local `argostranslate`.

## Docs

Docs are Markdown with front-matter (`title`, `group`, `order`, `summary`).
Groups: `start`, `chat`, `editor`, `features`, `extensions`, `lsp`, `dev`,
`changelog`.

```bash
npm run docs:check   # front-matter present + every relative .md link resolves
npm run docs         # build index.json / docs.json / llms.txt / doc/ / md/
npm run docs:init    # write front-matter where it is missing
```

Adding a `.md` file makes it appear in the navigation automatically. The
generated bundle is published to Cloudflare R2 by `.github/workflows/docs-publish.yml`
on tags and on docs changes to `master`.

## Commits and versioning

Observed in `git log`: a **short, lowercase, one-line** subject, usually a
Conventional Commit prefix with a scope — `feat(layout):`, `fix(sef):`,
`docs(changelog):`, `refactor(editor):`, `perf(startup):`, `test(i18n):`,
`chore(plans):` — and bare version numbers for release commits (`0.1.3`).
`VERSIONING.md` states: "Commit de laburo: 1 línea libre, corta, minúscula."

Versioning is a base-10 odometer: `0.1.9 → 0.2.0`, `0.9.9 → 1.0.0`. `0.x` is
beta. On a clean `master`:

```bash
npm run up               # bump + commit + tag vX.Y.Z + push
npm run up -- --no-push  # do everything except push
```

Pushing the tag triggers the release workflow (see [Updates](../updates.md)).

## CI

`.github/workflows/ci.yml` runs on pushes to `main`/`master` and on pull
requests, in two jobs:

- **`ci` (`ubuntu-latest`)** — install with **`npm ci --ignore-scripts`** (it
  pins the tree to `package-lock.json`; a step fails if anything rewrites it),
  then **typecheck**, **tests**, `node tools/i18n.mjs --check` (non-blocking
  warning) and **build**.
- **`windows` (`windows-latest`)** — the same install, **typecheck** and the full
  suite. Windows is a shipped target and much of the suite touches the real
  filesystem (atomic installs, accounts, LSP child processes), so a win32-only
  failure no longer passes review.

The release workflow additionally `npm rebuild node-pty`, runs the suite on both
platforms (Windows included — it used to skip it) and makes the i18n check
blocking with `--check --strict`.

## Limits

- There is **no lint or format script** in `package.json`; correctness is gated
  by `typecheck` and the test suite.
- In CI the i18n check is a **warning**, not a failure; only a release is
  strict.
- **CI runs the suite on both Linux and Windows.** A few suites skip themselves
  when the host lacks a tool or artifact — `terminal-font-stack` without
  `fc-match`, `tree-sitter-tokenizer` without the built parser — and
  `binaries.test.ts` is POSIX-only (`it.skipIf(win32)`). The files declare their
  own skip conditions, so a green run is not automatically full coverage.
- The docs build imports `react-dom/server`, so building the docs bundle needs
  the app dependencies installed.
- Conventional Commit prefixes are a **convention**, not enforced by CI.

## Next steps

- [Install](../getting-started/install.md) — releases and building from source.
- [Project structure](../getting-started/project-structure.md) — where code lives.
- [SEF CLI](../extensions/reference/cli.md) — `sef create/build/pack/validate`.
- [LSP system tests](../lsp/testing.md) — the mock server and coverage.
