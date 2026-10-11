---
title: "Your first extension"
group: extensions
order: 20
summary: "Full tutorial: create a scaffold, add a button and a tab, package the .sef and install it in Scrakk Studio."
---
# Your first extension

We will build an extension that contributes **three things at once**: a **panel**
(a React component), a **button** in the activity bar that opens it, and a **tab**
in the center strip. In the end you install it as a `.sef`.

Everything rests on a single file: `manifest.json`. The code is plain React
components; Scrakk mounts them where the manifest says.

## 0. Requirements

- **Node 20+** and the `sef` CLI: `npm install -g @scrakk-official/cli` (or use
  `npx @scrakk-official/cli …` per command). The CLI ships its own `esbuild`, so
  you do **not** need the Scrakk Studio repo checked out to author.
- No runtime Node needed: a **declarative** extension does not run its own code.

## 1. Create the scaffold

```sh
sef create "My Extension" ./my-extension
```

This creates `<dir>/<id>/` (the `id` comes from the name lowercased, with weird
characters turned into `-`). You get:

```text
my-extension/
├── manifest.json
└── panels/
    └── Panel.tsx
```

`manifest.json` (real, exactly as the scaffold generates it):

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "0.1.0",
  "author": "",
  "description": "My Extension — Scrakk Studio extension.",
  "engine": ">=0.1.0",
  "permissions": [],
  "entry": "dist/modules.js",
  "contributes": {
    "panels": [
      {
        "id": "my-extension-panel",
        "title": "My Extension",
        "closable": true,
        "component": "panels/Panel.tsx"
      }
    ]
  }
}
```

`panels/Panel.tsx`:

```tsx
export default function Panel() {
  return (
    <div style={{ padding: 16, fontSize: 13 }}>
      <strong>My Extension</strong>
      <p>My first Scrakk Studio extension.</p>
    </div>
  )
}
```

> Use **ASCII names**: `"Mi Extensión"` yields `mi-extensi-n` (the accent is
> lost when the `id` is built). `"My Extension"` yields `my-extension`.

## 2. Compile the bundle

```sh
cd my-extension
sef build .
# ✓ bundle: …/my-extension/dist/modules.js (1 modules)
```

The packager is **generic**: it reads the manifest, gathers every **code** path
(`panels[].component`, `activityBar[].icon`, `centerTabs[].component`,
`centerTabs[].icon`) and generates a virtual entry that exports them. The result
is a self-contained ESM file, `dist/modules.js`, with a `path → Component` map:

```js
export const modules = {
  "panels/Panel.tsx": Panel
}
```

The keys of `modules` are **exactly** the `component`/`icon` from the manifest.
`react` and `react-dom` stay `external`: the app provides them.

## 3. Add a button and a tab

Edit the manifest to add `activityBar` and `centerTabs`, and create their modules.

`manifest.json` → `contributes`:

```json
"contributes": {
  "panels": [
    { "id": "my-extension-panel", "title": "My Extension", "closable": true, "component": "panels/Panel.tsx" }
  ],
  "activityBar": [
    {
      "id": "my-extension-btn",
      "label": "My Extension",
      "icon": "icons/button.tsx",
      "side": "left",
      "target": "left",
      "panelId": "my-extension-panel",
      "order": 50
    }
  ],
  "centerTabs": [
    {
      "id": "my-extension-dashboard",
      "label": "My tab",
      "icon": "icons/button.tsx",
      "closable": true,
      "component": "tabs/Dashboard.tsx"
    }
  ]
}
```

- `activityBar[].icon` and `centerTabs[].icon` are **modules** (not icon ids): a
  `.tsx` whose `export default` is a component that takes `{ size?: number }`.
- `activityBar[].panelId` must exist as a panel (`panels[].id`).
- A `centerTabs` entry is **also registered as a panel** with the same `id`.

`icons/button.tsx`:

```tsx
export default function ButtonIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" /></svg>
}
```

`tabs/Dashboard.tsx`:

```tsx
export default function Dashboard() {
  return <div style={{ padding: 16 }}>My Extension dashboard</div>
}
```

Build again: now `dist/modules.js` contains all **three** paths.

## 4. Package and install

```sh
sef pack .                   # validates and writes ../my-extension.sef
```

The `.sef` is a **ZIP** with the manifest and the bundle (and the data folders, if
any):

```text
my-extension.sef (ZIP)
├── manifest.json
└── dist/
    └── modules.js
```

Install it from **Settings → Extensions → Install .sef**, pick the file, and the
extension becomes **active** instantly: you can see its button in the activity
bar, open the panel and the tab. You can **disable** it (without uninstalling)
with the toggle.

> To iterate: edit, `sef build`, `sef pack`, and install the `.sef` again. There
> is no hot reload for `.sef` packages; re-installing is how you update.

## 5. Validate before packing (optional)

```sh
sef validate .
# ✓ valid package
# or, if something is missing:
# ✗ panels/Panel.tsx: code file not found
```

`sef pack` validates too (and **refuses** to pack an invalid package): validation
is not an extra, it is part of the flow.

## Notes and real limits

- **`entry`**: the scaffold writes `entry: "dist/modules.js"`. If you write the
  manifest by hand, keep it in mind: the loader uses `manifest.entry` and, if it
  is missing, falls back to `dist/index.js`. A bundle that does not match `entry`
  is not loaded (the extension gets registered but **without its code**).
- **The CLI bundles** today the paths of `panels`, `activityBar` and
  `centerTabs`. For `fileHandlers.component` or `tools.visual` (other React
  modules in the package) those paths are **not** added to the bundle yet — use
  them carefully until `collectCodePaths` covers them.
- **Data vs. code paths**: the theme/icon `path` values point to **JSON** (read
  from the package); the `component`/`icon` values point to **modules** (checked
  against the bundle).

## Next steps

- [Manifest](../reference/manifest.md) and [Contributes](../reference/contributes.md)
  — every field and the 14 kinds.
- [SEF CLI](../reference/cli.md) — the create/build/pack/validate details.
- [Packaging](../guides/packaging.md) — the v2 layout and installation.
