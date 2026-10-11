---
title: "Packaging"
group: extensions
order: 170
summary: "What a .sef is, the package layout, the bundle, and how the app installs and loads it."
---
# Packaging

A **`.sef`** is a **ZIP** with the `manifest.json` at the root —or inside a single
folder— and the files the extension needs. It is built with the
[CLI](../reference/cli.md) (`sef pack`) or by hand.

## How a `.sef` is built

The builder is the **SEF CLI**, in its own repo
([`Scrakk-Team/sef-builder`](https://github.com/Scrakk-Team/sef-builder), npm
`@scrakk-official/cli`, binary `sef`):

1. **`sef build`** reads `manifest.json`, collects every **code** path
   (`panels[].component`, `activityBar[].icon`, `centerTabs[].component`/`.icon`)
   and bundles them with **esbuild** (`format: esm`, `jsx: automatic`,
   `react`/`react-dom` external) into `dist/modules.js`.
2. **`sef pack`** validates the package and **zips** `manifest.json` + `dist/` +
   the data folders into `<name>.sef`.

```sh
npm install -g @scrakk-official/cli
sef build . && sef pack .
```

Without the registry:
`npm install -g https://github.com/Scrakk-Team/sef-builder/releases/latest/download/cli.tgz`.
And since a `.sef` is just a ZIP, you can also assemble it by hand (see **By
hand** below).

## Two package shapes

### Declarative (the normal case)

```text
my-extension.sef (ZIP)
├── manifest.json
└── dist/
    └── modules.js        # self-contained ESM bundle
```

The bundle exports a **`modules`** map of *manifest path → Component*:

```js
export const modules = {
  "panels/Panel.tsx": Panel,
  "icons/button.tsx": ButtonIcon,
  "tabs/Dashboard.tsx": Dashboard
}
```

The keys are **exactly** the `component`/`icon` values from the manifest. A
contribution whose module does not exist is skipped with a warning.
`manifest.entry` points to the entry (the CLI writes `dist/modules.js`; the
loader default is `dist/index.js`).

### With code (an extension converted from VS Code)

```text
my-extension.sef (ZIP)
├── manifest.json         # includes "runtime": { "kind": "node", "entry": "extension.js" }
├── .source.json          # origin (original vsix, coverage, translator version)
└── <package as-is>       # entry, modules, media/, packaged node_modules…
```

The translator **copies the full package with its original paths**: multi-file
extensions do `require('./other')` and `context.asAbsolutePath('media/x.css')`, so
everything stays at the same relative location it had in the `.vsix`.
`manifest.json` and `.source.json` are reserved.

## How it is installed

- The **main** extracts the zip into `userData/extensions/<id>/`, validates the
  `id` (anti path-traversal) and rejects invalid ids.
- In the **renderer**, the declarative bundle is read over IPC and imported as a
  **data-URL** (`data:text/javascript;base64,…`), because the renderer runs in a
  sandbox and has no filesystem.
- The loader registers the contributions (on boot, or when installing from
  Settings → Extensions) and the extension is ready.

## v2 layout (source package)

```text
my-extension/
├── manifest.json
├── panels/, activitybar/, centerTabs/, …   # code (React/TS)
├── themes/<id>.json                         # data by convention
├── icons/<id>.json
├── productIcons/<id>.json
├── lsp/
└── dist/modules.js                          # compiled bundle
```

The `.sef` carries `manifest.json` + `dist/` + the data folders. The source code
does **not** travel: it travels compiled in `dist/modules.js`.

## By hand

```sh
zip -r my-extension.sef manifest.json dist themes icons productIcons
```

## Re-translation (VSIX only)

`.sef` packages converted from VS Code can be **re-translated** when the translator
improves, as long as the original `.vsix` is still on disk (path stored in
`.source.json`). See
[VS Code compatibility](../architecture/vscode-compatibility.md).

## Notes

- An installed `.sef` is marked `isBuiltin: false` and can be enabled/disabled
  without uninstalling.
- The `.sef` installer does **not** apply anti zip-bomb limits (only the `.vsix`
  one does): it is a real difference between the two paths.
- The real installer uses the same validation code as `sef validate`.

## Next steps

- [SEF CLI](../reference/cli.md) — the commands and the rules.
- [Your first extension](../getting-started/your-first-extension.md) — the full
  cycle.
