---
title: "SEF CLI"
group: extensions
order: 220
summary: "The authoring CLI (sef create/build/pack/validate), the v2 package layout and the validation rules."
---
# SEF CLI

Authoring lives in its **own repo**,
[`Scrakk-Team/sef-builder`](https://github.com/Scrakk-Team/sef-builder), and is
published to npm as
[`@scrakk-official/cli`](https://www.npmjs.com/package/@scrakk-official/cli). It
installs the **`sef`** binary:

```sh
# from the GitHub Release — works without the npm registry:
npm install -g https://github.com/Scrakk-Team/sef-builder/releases/latest/download/cli.tgz

# from npm:
npm install -g @scrakk-official/cli
npx @scrakk-official/cli <command> …      # per invocation, without installing
```

Standalone Linux/macOS/Windows binaries (no Node required) are attached to every
release as well.

```sh
sef create   "<name>" [dir]   # scaffold (sample panel)
sef build    <dir>            # bundle → dist/modules.js
sef pack     <dir>            # validates and writes <dir>.sef
sef validate <dir>            # validate only
sef --help                    # usage
sef --version                 # CLI version
```

## `create`

```sh
sef create "My Extension" ./my-extension
```

- Computes the `id` from the name: lowercased and anything that is not
  `[a-z0-9._-]` becomes `-` (accents **are lost**). Use ASCII.
- Creates `<dir>/<id>/` with a `manifest.json` and a sample `panels/Panel.tsx`.
- The generated manifest includes `"entry": "dist/modules.js"` (so the loader
  finds the bundle).

## `build`

```sh
sef build ./my-extension
# ✓ bundle: …/my-extension/dist/modules.js (3 modules)
```

Generates the **virtual entry** from the manifest (nothing hardcoded) and
compiles with `esbuild` (`format: esm`, `jsx: automatic`, `platform: browser`) to
`dist/modules.js`, which exports:

```js
export const modules = { "panels/Panel.tsx": Panel, … }
```

The modules the **IDE lends** stay as imports — they are never bundled in:
`react`, `react-dom` (and `react-dom/client`), `react/jsx-runtime` and
`@features/layout` (the panel hooks). The loader resolves them to the app's own
modules, so your panel shares the app's React (hooks keep working). Anything else
you import *is* compiled in.

The paths collected today are: `panels[].component`, `activityBar[].icon`,
`centerTabs[].component` and `centerTabs[].icon`. (`fileHandlers.component` and
`tools.visual` do **not** enter the bundle yet.)

## `pack`

```sh
sef pack ./my-extension
# ✓ package: …/my-extension.sef
```

- **Validates first**; if there are errors, it does not pack.
- Zips the manifest + `dist/` + the data folders (`themes/`, `icons/`,
  `productIcons/`, `lsp/`, `events/`) into `<packageRoot>.sef` (the `.sef` lands
  **next to** the package folder).

## `validate`

```sh
sef validate ./my-extension
# ✓ valid package
# ✗ panels/Panel.tsx: code file not found
```

Rules it checks (mirroring the core's):

- `id` matches `^[a-z0-9][a-z0-9._-]*$`; `name` not empty; `version` semver.
- `engine` (if present) is a string.
- `runtime` (if present) is `{ entry: string }`.
- `permissions` (if present) belong to the catalogue: `fs.read`, `fs.write`,
  `fs.all`, `shell.exec`, `network.fetch`, `lsp.use`.
- `contributes` exists and **every key is a known kind**.
- Every referenced **code** path exists in the source package.
- Themes/icons without `path` have their conventional file (`themes/<id>.json`,
  `icons/<id>.json`, `productIcons/<id>.json`). Events instead need a `path` or
  an inline `scene`, and the scene they point at must carry a `specVersion` and a
  `timeline`.

## v2 package layout

```text
my-extension/
├── manifest.json            # the source of truth
├── panels/, activitybar/, centerTabs/, …   # source code (React/TS)
├── themes/<id>.json         # data by convention
├── icons/<id>.json
├── productIcons/<id>.json
├── events/<id>.json         # event scenes (contributes.events → path)
├── lsp/                     # language server data (optional)
└── dist/
    └── modules.js           # compiled bundle (the entry)
```

When packing, the `.sef` carries `manifest.json`, `dist/` and the data folders.
The source code (`.tsx`) **does not** travel: it travels compiled inside
`dist/modules.js`.

## Common errors

| Message | Cause |
|---|---|
| `code file not found` | The manifest `component`/`icon` does not exist on disk (or the relative path is wrong) |
| `unknown type (…)` | A key in `contributes` is not one of the 15 kinds |
| `escena del evento no encontrada` | An `events[]` entry points at a `path` that does not exist |
| `la escena necesita "timeline"` | The event scene is missing its `timeline` (or its `specVersion`) |
| `semver version required` | `version` is not `x.y.z` |
| `permissions must be an array of: …` | A permission outside the catalogue |
| `manifest.json not found` | You ran the command in the wrong folder |

## Where it lives

The CLI is its **own repo** — [`Scrakk-Team/sef-builder`](https://github.com/Scrakk-Team/sef-builder) —
so its releases (tags, `cli.tgz`, `install.sh`) never mix with Scrakk Studio's
and the app's auto-update is untouched. `sef build` mirrors the app's runtime
rules; when the core's validation changes, update `src/schema.ts` there and ship
a release.

Its CI runs typecheck + tests + build, and publishing is done on `v*` tags via
**npm Trusted Publishing** (OIDC — no token stored), attaching `cli.tgz` +
`install.sh` to that repo's GitHub Release as a registry-free fallback.

To ship a version: bump `package.json` in `sef-builder`, tag `vX.Y.Z` and push.
One-time setup on npm — **`@scrakk-official/cli` → Settings → Trusted Publisher →
GitHub Actions**, repository `Scrakk-Team/sef-builder`, workflow `publish.yml`.

## Next steps

- [Packaging](../guides/packaging.md) — the full cycle and how it is installed.
- [Manifest](../reference/manifest.md) and [Contributes](contributes.md).
