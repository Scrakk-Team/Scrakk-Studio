---
title: "SEF CLI"
group: extensions
order: 220
summary: "The authoring CLI (sef create/build/pack/validate), the v2 package layout and the validation rules."
---
# SEF CLI

Authoring lives in [`packages/cli/`](../../../packages/cli) and is exposed through npm
scripts, as a standalone package published to npm as
[`@scrakk-official/cli`](https://www.npmjs.com/package/@scrakk-official/cli):

```sh
npx @scrakk-official/cli build <dir>    # published CLI (binary: `sef`)

npm run sef:create  -- "<name>" [dir]   # scaffold (sample panel)
npm run sef:build   -- <dir>            # bundle → dist/modules.js
npm run sef:pack    -- <dir>            # validates and writes <dir>.sef
npm run sef:validate -- <dir>           # validate only
```

The base script is `node packages/cli/src/index.ts <command> …` (the `npm run`
wrappers are sugar). Offline install of the CLI, without the npm registry:

```sh
curl -fsSL https://raw.githubusercontent.com/Scrakk-Team/Scrakk-Studio/master/packages/cli/install.sh | bash
```

## `create`

```sh
npm run sef:create -- "My Extension" ./my-extension
```

- Computes the `id` from the name: lowercased and anything that is not
  `[a-z0-9._-]` becomes `-` (accents **are lost**). Use ASCII.
- Creates `<dir>/<id>/` with a `manifest.json` and a sample `panels/Panel.tsx`.
- The generated manifest includes `"entry": "dist/modules.js"` (so the loader
  finds the bundle).

## `build`

```sh
npm run sef:build -- ./my-extension
# ✓ bundle: …/my-extension/dist/modules.js (3 modules)
```

Generates the **virtual entry** from the manifest (nothing hardcoded) and
compiles with `esbuild` (`format: esm`, `jsx: automatic`, `platform: browser`,
`external: ['react','react-dom']`) to `dist/modules.js`, which exports:

```js
export const modules = { "panels/Panel.tsx": Panel, … }
```

The paths collected today are: `panels[].component`, `activityBar[].icon`,
`centerTabs[].component` and `centerTabs[].icon`. (`fileHandlers.component` and
`tools.visual` do **not** enter the bundle yet.)

## `pack`

```sh
npm run sef:pack -- ./my-extension
# ✓ package: …/my-extension.sef
```

- **Validates first**; if there are errors, it does not pack.
- Zips the manifest + `dist/` + the data folders (`themes/`, `icons/`,
  `productIcons/`, `lsp/`) into `<packageRoot>.sef` (the `.sef` lands **next to**
  the package folder).

## `validate`

```sh
npm run sef:validate -- ./my-extension
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
  `icons/<id>.json`, `productIcons/<id>.json`).

## v2 package layout

```text
my-extension/
├── manifest.json            # the source of truth
├── panels/, activitybar/, centerTabs/, …   # source code (React/TS)
├── themes/<id>.json         # data by convention
├── icons/<id>.json
├── productIcons/<id>.json
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
| `unknown type (…)` | A key in `contributes` is not one of the 14 kinds |
| `semver version required` | `version` is not `x.y.z` |
| `permissions must be an array of: …` | A permission outside the catalogue |
| `manifest.json not found` | You ran the command in the wrong folder |

## Next steps

- [Packaging](../guides/packaging.md) — the full cycle and how it is installed.
- [Manifest](../reference/manifest.md) and [Contributes](contributes.md).
