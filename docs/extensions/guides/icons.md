---
title: "Icons"
group: extensions
order: 90
summary: "File icon themes (fileIcons) and UI icon themes (productIcons): the manifest slice and the real JSON of each."
---
# Icons

Scrakk has **two** independent icon themes: **file** icons (explorer, tabs) and
**UI** icons (buttons, chevrons — the builtin pack is ProIcons). Each one is a
separate contribution.

## File icons (`fileIcons`)

```json
{
  "fileIcons": [
    { "id": "acme-icons", "name": "Acme Icons", "path": "icons/acme-icons.json" }
  ]
}
```

Convention: if you omit `path`, `icons/<id>.json` is expected.

The theme JSON (the **SEF fileIcons** format, not 1:1 VS Code):

```json
{
  "id": "acme-icons",
  "name": "Acme Icons",
  "iconDefinitions": {
    "ts": "data:image/svg+xml;base64,PHN2Zy…"
  },
  "fileExtensions": { "ts": "ts", "tsx": "ts" },
  "fileNames": { "package.json": "npm" },
  "folderNames": { "src": "src" },
  "folderNamesExpanded": { "src": "src-open" },
  "languageIds": { "typescript": "ts" },
  "file": "file",
  "folder": "folder",
  "folderExpanded": "folder-open",
  "rootFolder": "folder",
  "rootFolderExpanded": "folder-open",
  "hidesExplorerArrows": false
}
```

**Key rule**: every `iconDefinitions` entry must be a **data URI** (`data:…`). A
definition that is not is dropped with a warning. The maps (`fileExtensions`,
`fileNames`, …) are optional and tolerant.

> The builtin **Material Icon Theme** is the real reference: it was converted from
> the MIT VS Code extension with the project's own translator.

## UI icons (`productIcons`)

```json
{
  "productIcons": [
    { "id": "acme-ui", "name": "Acme UI", "path": "productIcons/acme-ui.json" }
  ]
}
```

Convention: `productIcons/<id>.json`.

The JSON (the **SEF productIcons** format):

```json
{
  "id": "acme-ui",
  "name": "Acme UI",
  "fonts": [
    {
      "id": "acme",
      "dataUri": "data:font/woff2;base64,d09GMg…",
      "format": "woff2"
    }
  ],
  "iconDefinitions": {
    "files": { "fontCharacter": "\\e900", "fontId": "acme" },
    "search": { "fontCharacter": "\\e901", "fontId": "acme" }
  }
}
```

- `fonts[]`: `{ id, dataUri, format?, family?, weight?, style? }`. Only **data
  URIs** are accepted; `format` ∈ `woff`/`woff2`/`truetype`/`opentype`
  (default `woff`).
- `iconDefinitions`: `{ fontCharacter, fontId? }`. The `fontCharacter` is the
  glyph position in the font (the tedious part of an icon theme).

A theme with no fonts **or** no definitions is dropped with a warning.

The builtin pack (`scrakk`) uses **VS Code codicon ids** where the concept
exists, so a theme overrides them exactly by id. It also ships Scrakk-only ids
that are **components**, not glyphs — for example **`verified-badge`** (the seal
next to a verified account or extension). A theme that does not define them keeps
the builtin one.

## Activate

Both are listed in **Settings → Extensions** (the "File icons" and "UI icons"
sections). File icons have an active theme; UI icons do too (the default is
ProIcons). They apply live.

## Rules

- `id`s are global across extensions.
- The `path` is **data**: it is read from the package with `readFile`; an invalid
  JSON is dropped without breaking the rest of the extension.

## Next steps

- [Color themes](themes.md).
- [Contributes](../reference/contributes.md).
