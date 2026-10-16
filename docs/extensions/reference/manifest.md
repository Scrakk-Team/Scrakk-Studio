---
title: "Manifest"
group: extensions
order: 200
summary: "Every field of the manifest.json of a SEF extension: identity, code, permissions and contributions."
---
# Manifest

The `manifest.json` is the **source of truth** of an extension. It is
declarative: everything the extension contributes is described there and the
**loader** turns it into registered contributions. Only `id`, `name` and
`version` are required.

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "0.1.0",
  "author": "Acme",
  "description": "An example extension.",
  "engine": ">=0.1.0",
  "permissions": ["fs.read"],
  "entry": "dist/modules.js",
  "contributes": {
    "panels": [
      { "id": "my-panel", "title": "My panel", "component": "panels/Panel.tsx" }
    ]
  }
}
```

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique id. Regex `^[a-z0-9][a-z0-9._-]*$`. Defines the install folder of a `.sef` |
| `name` | string | yes | Display name |
| `version` | string | yes | **semver** version (validated by the CLI and by `parseVersion`) |
| `author` | string | no | Author |
| `description` | string | no | Short description |
| `engine` | string | no | App version constraint (e.g. `>=0.1.0`) |
| `permissions` | string[] | no | Declared permissions — **deny-by-default** (see [Permissions](../guides/permissions.md)) |
| `entry` | string | no | Compiled bundle entry. Loader default: `dist/index.js`. The CLI writes `dist/modules.js` |
| `runtime` | object | no | **Extension with code**: `{ "kind": "node", "entry": "extension.js" }`. Marks that the Extension Host must run the package |
| `contributes` | object | no | The contributions (see [Contributes](contributes.md)) |
| `hidden` | boolean | no | Not listed in Settings → Extensions, but **still active**. For internal data packs (e.g. the languages pack) |

`entry` vs `runtime`: `entry` is the **UI bundle** (React components the renderer
mounts); `runtime` is the **extension code** that runs in the Extension Host. A
declarative extension uses `entry`; an extension with code (like converted VS
Code ones) uses `runtime`.

## `contributes`

Each key of `contributes` is a contribution kind. The loader is generic: it
iterates the keys and asks the `ExtensionTypeRegistry` for each one's handler —
it **knows no types**. The 15 kinds and their exact fields are in
[Contributes](contributes.md).

## Paths: code vs. data

- The `component`/`icon` values (panels, buttons, tabs, and a tool's `visual`)
  point to **modules** in the bundle. They are checked with `hasModule(path)`: if
  the module is not in the bundle, that contribution is dropped with a warning.
- The **data** `path` values (themes, icons, grammars, snippets, `SKILL.md`)
  point to files in the package and are read with `readFile` (only `.sef` have
  them on disk; builtins resolve them embedded).

## Rules

- The `id` is used as the install folder name and is validated against path
  traversal (`safeExtensionId`).
- An invalid contribution is **skipped with a warning** naming the extension and
  the reason; it never crashes the boot or the rest of the extension.
- A manifest without `id` is ignored.
- An installed extension is marked `isBuiltin: false` and can be
  enabled/disabled without uninstalling.

## Next steps

- [Contributes](contributes.md) — the 15 kinds with their fields.
- [SEF CLI](cli.md) — validation and package layout.
- [Permissions](../guides/permissions.md) — the catalogue and the jail.
