---
title: "Builtin"
group: extensions
order: 240
summary: "How an extension ships inside the app: a folder per type, eager globs, and the builtins that already exist."
---
# Builtin

A **builtin** extension is an extension compiled **into the app bundle**. There is
no `.sef`, no disk: manifests are read with an eager glob and components are
resolved with globs that Vite embeds in the build.

## Where it lives

```text
src/renderer/src/services/extensions/builtin/
├── <type>/<id>/manifest.json      # the FIRST segment declares the primary type
├── <type>/<id>/…                   # components, icons, data
```

The manifest is detected with the glob `builtin/*/*/manifest.json`. A single
builtin can contribute **several** kinds at once (a `panels` entry plus its
`activityBar` button and a `centerTabs` tab, for example), but its folder
declares its primary type.

A manifest looks like this (illustrative):

```json
{
  "id": "hello",
  "name": "Hello",
  "version": "0.1.0",
  "author": "Scrakk Studio",
  "description": "Hello: side panel, activity bar button and center tab.",
  "engine": ">=1.0.0",
  "contributes": {
    "panels": [
      { "id": "hello", "title": "Hello", "closable": true, "component": "panels/hello/Panel.tsx" }
    ],
    "activityBar": [
      { "id": "hello-btn", "label": "Hello", "icon": "activitybar/hello/index.ts", "side": "left", "target": "left", "panelId": "hello", "order": 60 }
    ],
    "centerTabs": [
      { "id": "hello-dashboard", "label": "Dashboard", "icon": "centerTabs/dashboard/index.ts", "closable": true, "component": "centerTabs/dashboard/DashboardTab.tsx" }
    ]
  }
}
```

## Module resolution

The builtin resolver maps `manifest path → bundle module` with globs:

- `resolveComponent(path)` → lazy `import()` of the module.
- `resolveIcon(path)` → the icon component (eager).
- `hasModule(path)` → whether the glob knows that path.

The paths are **relative to the package folder**
(`panels/hello/Panel.tsx`).

## Loading and enable/disable

- On boot, `loadBuiltinExtensions()` walks every manifest and registers the
  enabled ones.
- Disabling a builtin skips it on boot; `registerBuiltinExtensionById(id)`
  re-registers it live (that is what the Settings toggle does).
- To **hide** it from Settings without disabling it, set `"hidden": true` in the
  manifest (that is how the languages pack, `langs/manifest.json`, ships).

## Builtins that already exist

| Builtin | Type | Adds |
|---|---|---|
| `innerta-terminal` | panels | the native terminal panel |
| `material-icon-theme` | fileIcons | the default file icon theme |
| `themes/*` | themes | ~100 color themes (a few carry extra chrome: `opencode-ai` sets `radius: "rect"`, `vscode-dark-modern` and `discord` set reduced/bigger corners, and many set their own UI `fonts`) |
| `langs` (outside `builtin/`, in `langs/`) | languages | the tree-sitter grammar pack (exposed as one more extension, with `hidden`) |

## Builtin vs. `.sef`

| | Builtin | Installed `.sef` |
|---|---|---|
| Where it lives | in the app bundle | `userData/extensions/<id>/` |
| Modules | globs, embedded | `dist/modules.js` bundle (data-URL) |
| Data | embedded by folder convention | read from disk (`ctx.readFile`) |
| `isBuiltin` | `true` | `false` |
| Can be uninstalled | no (but disabled/hidden) | yes |

## Next steps

- [Packaging](../guides/packaging.md) — for the ones that do get installed.
- [Contributes](contributes.md) — the kinds it can contribute.
- [Extension API](api.md) — what a handler receives (`fs`, `lsp`, `tooltips`, `notifications`, `radius`).
