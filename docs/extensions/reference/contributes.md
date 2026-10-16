---
title: "Contributes"
group: extensions
order: 210
summary: "The 15 contribution kinds of a SEF extension, with their real fields and where each one is mounted."
---
# Contributes

A **contribution** is each thing an extension adds. They are all declared under
`manifest.contributes`. The loader is **generic**: it iterates the keys and asks
the `ExtensionTypeRegistry` for each one's handler (`loader/resolve.ts`). An
unknown key is logged and skipped — the app never crashes because of a broken
extension.

The **15 kinds** that exist today:

| Key | Adds | Mounted in | Code? |
|---|---|---|---|
| `panels` | React panel from the package | Any layout slot | yes (bundle) |
| `activityBar` | Bar button | Activity bar | yes (icon) |
| `centerTabs` | Center strip tab | Center | yes (bundle) |
| `views` | View served by the Extension Host | Activity bar | yes (host) |
| `themes` | Color theme | IDE CSS tokens | no (data) |
| `fileIcons` | File icon theme | Explorer, tabs | no (data) |
| `productIcons` | UI icon theme | Whole app | no (data) |
| `languages` | Language kit | Editor | no (data) |
| `lspServers` | Language server | Main-process runtime | no (the IDE runs it) |
| `tools` | AI tool | Chat + Settings | optional (visual) |
| `skills` | Skill (Agent Skills) | Chat | no (reads `SKILL.md`) |
| `fileHandlers` | Viewer for a format | Editor tabs | optional (component) |
| `encodings` | Text codec | Opening/saving files | yes (JS module) |
| `notifications` | Extension notification | Notification center | no |
| `events` | Timed experience (visual + audio scene) | Whole app (effects overlay) | no (data) |

> "Code?" refers to the **extension's** code: the React bundle the renderer
> mounts, or the module the Extension Host runs.

---

## panels

A React component mounted in a layout slot (left/center/right/bottom).

```json
{ "panels": [{ "id": "hello", "title": "Hello", "closable": true, "component": "panels/Panel.tsx" }] }
```

| Field | Type | Required |
|---|---|---|
| `id` | string (global) | yes |
| `title` | string | yes |
| `closable` | boolean | no |
| `component` | path to a bundle module | yes |

Guide: [Panels](../guides/panels.md).

## activityBar

A side-bar button that opens a panel.

```json
{ "activityBar": [{ "id": "hello-btn", "label": "Hello", "icon": "icons/hello.tsx", "side": "left", "target": "left", "panelId": "hello", "order": 60 }] }
```

| Field | Type | Required | Note |
|---|---|---|---|
| `id` | string | yes | Button id |
| `label` | string | yes | Tooltip / aria-label |
| `icon` | path to a module (`export default` = `{size?}` component) | yes | |
| `side` | `left` \| `right` | yes | Bar it lives in |
| `target` | `SlotId` | yes | Slot where the panel mounts |
| `panelId` | string | yes | Panel it opens |
| `order` | number | no | Ascending order |

Guide: [Activity bar](../guides/activity-bar.md).

## centerTabs

A center strip tab. It is **also registered as a panel** with the same `id`.

```json
{ "centerTabs": [{ "id": "dash", "label": "Dashboard", "icon": "icons/dash.tsx", "closable": true, "component": "tabs/Dash.tsx" }] }
```

| Field | Type | Required |
|---|---|---|
| `id` | string (global) | yes |
| `label` | string | yes |
| `icon` | path to a module | no |
| `closable` | boolean | no |
| `component` | path to a module | yes |

Guide: [Center tabs](../guides/center-tabs.md).

## views

An activity bar view whose content is served by the **Extension Host** (the
extension runs code). Several views with the same `container` share a button and
a panel.

```json
{
  "views": [
    {
      "id": "pub.ext.chat",
      "name": "Chat",
      "container": "pub.ext.side",
      "containerTitle": "My extension",
      "iconSvg": "<svg …>",
      "order": 10,
      "when": "ext.ready",
      "collapsed": false,
      "hidden": false,
      "welcome": [
        { "contents": "Nothing here.\n[Create](command:pub.ext.create)", "when": "ext.empty" }
      ]
    }
  ]
}
```

| Field | Type | Required |
|---|---|---|
| `id` | global string (`publisher.extension.view`) | yes |
| `name` | string | yes |
| `container` | string (container id = button) | yes |
| `containerTitle` | string | no |
| `iconSvg` | string (inline SVG, `currentColor`) | no |
| `order` | number | no |
| `when` | `when` clause | no |
| `welcome` | `[{ contents, when? }]` | no |
| `collapsed` | boolean | no |
| `hidden` | boolean | no |

Guide: [Views](../guides/views.md).

## themes

A color theme; `path` points to the theme JSON. Package convention:
`themes/<id>.json` if there is no `path`.

```json
{ "themes": [{ "id": "my-theme", "name": "My theme", "type": "dark", "path": "themes/my-theme.json" }] }
```

Guide: [Color themes](../guides/themes.md).

## fileIcons

A file icon theme. `path` → a JSON whose `iconDefinitions` are **data URIs**.
Convention: `icons/<id>.json`.

```json
{ "fileIcons": [{ "id": "my-icons", "name": "My icons", "path": "icons/my-icons.json" }] }
```

Guide: [Icons](../guides/icons.md).

## productIcons

A product/UI icon theme. `path` → a JSON with `fonts[]` (data URI) and
`iconDefinitions` (`fontCharacter`). Convention: `productIcons/<id>.json`.

```json
{ "productIcons": [{ "id": "my-ui", "name": "My UI", "path": "productIcons/my-ui.json" }] }
```

Guide: [Icons](../guides/icons.md).

## languages

The **language kit**: identity and file association + grammars + snippets +
defaults, in **one** contribution with optional pieces.

```json
{
  "languages": [
    {
      "id": "acme",
      "aliases": ["Acme"],
      "extensions": [".acme"],
      "configuration": "language-configuration.json",
      "icon": { "dark": "icons/acme.svg" },
      "grammars": [
        { "kind": "treeSitter", "parser": "grammars/acme.wasm", "queries": ["grammars/queries/highlights.scm"], "abi": "tree-sitter-abi-15", "sha256": "…" },
        { "kind": "textMate", "scopeName": "source.acme", "path": "grammars/acme.tmLanguage.json" }
      ],
      "snippets": [{ "path": "snippets/acme.json" }],
      "configurationDefaults": { "editor.tabSize": 2 }
    }
  ]
}
```

Fields of `languages[]`: `id`, `aliases`, `extensions`, `filenames`,
`filenamePatterns`, `firstLine`, `configuration`, `icon`, `grammars`,
`snippets`, `semanticTokenScopes`, `configurationDefaults`.

`grammars[]` (heterogeneous by `kind`):
- `treeSitter`: `parser`, `queries[]`, `queriesDir?`, `abi?`, `native?`, `sha256?`
- `textMate`: `scopeName`, `path`, `embeddedLanguages?`, `tokenTypes?`, `injectTo?`, `balancedBracketScopes?`, `unbalancedBracketScopes?`

Guide: [Languages](../guides/languages.md).

## lspServers

A declarative language server. It is registered in the main process (IPC) and the
renderer consumes its state. Priority:
`user > project (.scrakk/lsp.json) > dynamic (extensions) > builtin`.

```json
{ "lspServers": [{ "id": "acme-ls", "command": "acme-ls", "args": ["--stdio"], "extensions": { ".acme": "acme" }, "rootMarkers": ["acme.config"], "install": { "kind": "npm", "package": "acme-ls" } }] }
```

| Field | Type | Required |
|---|---|---|
| `id` | global string | yes |
| `command` | string | yes |
| `args` | string[] | no |
| `extensions` | `Record<ext, languageId>` | yes |
| `rootMarkers` | string[] | no |
| `gatedBy` | string | no |
| `install` | recipe (`npm`/`go`/`gem`/`dotnet`/`github`/`custom`) | no |
| `initializationOptions` / `settings` | object | no |

Guide: [Language servers](../guides/lsp-servers.md).

## tools

An AI tool. The `command` runs in the Extension Host; the React visual is
optional.

```json
{
  "tools": [
    {
      "name": "acme_deploy",
      "label": "Deploy",
      "description": "Deploys the current project.",
      "parameters": { "type": "object", "properties": { "environment": { "type": "string" } }, "required": ["environment"] },
      "command": "acme.deploy",
      "family": "acme", "familyLabel": "Acme Tools",
      "type": "acme-deploy", "typeLabel": "Deploy",
      "dangerLevel": "medium", "enabledByDefault": false,
      "icon": "server",
      "visual": "tools/deploy/visual.tsx",
      "visualCss": "tools/deploy/visual.css"
    }
  ]
}
```

Fields: `name` (regex `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`), `description`, `command`
(required); `label`, `parameters` (JSON Schema), `type`/`typeLabel`,
`family`/`familyLabel`/`familyIcon`, `dangerLevel` (`safe|low|medium|high`,
default `medium`), `enabledByDefault` (default `true`), `icon`, `headerArgKey`,
`visual`, `visualCss`, `permissions`.

An extension **cannot override** a builtin tool: the registry rejects the
duplicate name.

Guide: [AI tools](../guides/tools.md).

## skills

Skills (Agent Skills standard): each entry points to a `SKILL.md` in the package.

```json
{ "skills": [{ "name": "release-notes", "description": "Generates release notes.", "path": "skills/release-notes/SKILL.md" }] }
```

Guide: [Skills](../guides/skills.md).

## fileHandlers

A file format of your own, with its viewer.

```json
{ "fileHandlers": [{ "id": "acme-viewer", "match": { "extensions": ["acme"] }, "mode": "view", "priority": 10, "component": "viewers/Acme.tsx" }] }
```

| Field | Type | Required |
|---|---|---|
| `id` | global string | yes |
| `match` | `{ extensions?, globs?, languageIds?, scheme? }` (at least one) | yes |
| `mode` | `view` \| `text` \| `both` | no (default `text`) |
| `priority` | number (higher wins) | no |
| `component` | path to a module (viewer) | no |

Guide: [Formats and encodings](../guides/file-handlers.md).

## encodings

A text codec. The `module` is an ESM file in the package whose `export default`
implements `{ decode(bytes): string, encode(text): Uint8Array }`.

```json
{ "encodings": [{ "id": "koi8-r", "label": "KOI8-R", "module": "./encoding.js" }] }
```

Guide: [Formats and encodings](../guides/file-handlers.md).

## notifications

v1: the kind mostly exists as the carrier of `ctx.api.notifications`. If the
extension declares entries, their shape is validated.

```json
{ "notifications": [{ "id": "welcome", "title": "Hi", "corner": "tr" }] }
```

## events

A **temporary experience**: a scene of visual/audio ops the IDE plays inside a
date window and then turns off. `path` points to the scene JSON; `scene` inlines
it (builtins/tests).

```json
{ "events": [{ "id": "acme-meteor", "name": "Meteor shower", "path": "events/meteor.json" }] }
```

| Field | Type | Required |
|---|---|---|
| `id` | global string | yes |
| `name` | string | yes |
| `path` | path to a JSON scene in the package | one of `path`/`scene` |
| `scene` | inline scene object (no file) | one of `path`/`scene` |

Guide: [Events](../guides/events.md).

---

## Common rules

- Every handler validates the shape and, when relevant, the **module existence**
  (`hasModule`). Anything invalid is dropped with a warning.
- A package without a valid `contributes` is still registered (it shows up in
  Settings → Extensions) but contributes nothing.
- Contribution `id`s are global: two extensions cannot declare the same
  `panelId`/`view.id`.
- `encodings` and `notifications` **work** thanks to the generic loader, but they
  are not yet declared in the TypeScript interface `ExtensionContributions`.
