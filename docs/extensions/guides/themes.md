---
title: "Color themes"
group: extensions
order: 80
summary: "How to contribute a color theme: the manifest slice and the theme JSON (colors, tokens, background and fonts)."
---
# Color themes

A **color theme** is a JSON that redefines the IDE's CSS tokens. It is declared
under `contributes.themes` and the `path` points to the JSON inside the package.

```json
{
  "themes": [
    { "id": "acme-dark", "name": "Acme Dark", "type": "dark", "path": "themes/acme-dark.json" }
  ]
}
```

Package convention: if you omit `path`, `themes/<id>.json` is expected
(`sef validate` checks it).

| Field | Type | Required |
|---|---|---|
| `id` | global string | yes |
| `name` | string | yes |
| `type` | `dark` \| `light` | yes |
| `path` | string | no (convention `themes/<id>.json`) |

## The theme JSON

```json
{
  "name": "Acme Dark",
  "type": "dark",
  "colors": {
    "bg": "#0f1115",
    "surface": "#161a20",
    "accent": "#ff6b35",
    "text": "#e6e6e6",
    "textMuted": "#8a8f98",
    "diffAdded": "rgba(63,185,80,0.16)",
    "diffRemoved": "rgba(248,113,113,0.16)"
  },
  "tokenColors": [
    { "scope": ["comment"], "foreground": "#6b7280", "fontStyle": "italic" },
    { "scope": "keyword", "foreground": "#c586c0" }
  ],
  "flat": true,
  "fonts": { "ui": { "family": "Inter", "source": "https://…/inter.woff2" } },
  "background": { "type": "image", "image": "https://…/bg.jpg", "imageOpacity": 0.3, "imageBlur": "6px" }
}
```

## Valid colors

`colors` accepts **only** known keys (the others are ignored without a warning).
Each value is a color: `#hex` (3/6/8 digits), `rgb()`/`rgba()`, `transparent` or
`var(--token)`.

Color keys: `bg`, `surface`, `surfaceRaised`, `border`, `borderStrong`, `accent`,
`accentHover`, `accentActive`, `onAccent`, `text`, `textSecondary`, `textMuted`,
`error`, `errorHover`, `onError`, `warning`, `success`, `info`, `hover`, `active`,
`scrollbarThumb`, `scrollbarThumbHover`, `indentGuide`, `panelBorder`, `editorBg`,
`titleBarBg`, `activityBarBg`, `statusBarBg`, `diffAdded`, `diffRemoved`,
`diffModified`.

Also:

- `panelBorderOpacity` (number 0–100).
- `diffAdded/Removed/Modified` must carry **alpha** (they are backgrounds and the
  text is drawn on top).
- Colors you do not define are **not** filled with hard defaults: they fall back
  to the base theme coherent with `type`.

## `tokenColors`

TextMate-style syntax colors: `[{ scope, foreground?, fontStyle? }]`. `scope` is a
string or a list.

## Other fields

- `flat: true` — single-color chrome (the bars add a border).
- `radius` — the corners of the chrome (see **Corners** below): `"rect"`,
  `"round"` or a per-slot map.
- `fonts.ui` — UI font: `{ family, source?, size?, weight?, lineHeight? }`.
  `source` accepts `https:` or `data:` (≤ 4096 chars) in **two shapes**: a **font
  file** (`.woff2` / `.woff` / `.ttf` / `.otf` — the app writes the `@font-face`
  for you) or a **stylesheet** (e.g. Google Fonts `/css2?family=…`). `family`
  must match the family the file or stylesheet declares. If it cannot load, the
  theme stays on the fallback stack and a red notification says so.
- `background` — a layer behind the **whole** chrome. Two shapes:
  - `{ "type": "image", "image": "...", "imageOpacity"?, "imageSize"?, "imagePosition"?, "imageBlur"? }`.
    `image` is `https:` or `data:` (no quotes or spaces, ≤ 4096 chars).
  - `{ "type": "overlay", "overlay": "my-pack.scene", "opacity"? }`. It mounts
    an **overlay component** contributed by an extension
    (`contributes.overlays`), normally the same pack as the theme. This is how a
    theme can ship an animated scene instead of a static image. While an event
    has its own background, the event wins; when it ends, the theme's overlay
    comes back. The `overlay` id must be registered; if it is missing the theme
    simply has no background.

```json
{
  "background": { "type": "overlay", "overlay": "my-pack.night-sky", "opacity": 1 }
}
```

Both shapes turn on the theme's automatic glass blur for translucent
surfaces.

The theme is validated **tolerantly**: anything invalid is dropped with a warning
and the rest of the theme still applies.

## Corners

The layout draws the panels, inputs and chips from a few radius tokens, and a
theme redefines them:

```json
{ "radius": "rect" }
{ "radius": { "panel": "16px", "input": "6px" } }
```

- `"rect"` — everything square. The `capsule` stays round on purpose: it is a
  **shape**, not a corner (avatars, the resize dots); square it explicitly in the
  map if you really want to.
- `"round"` — the system radii (the default).
- a map — any of `panel`, `input`, `sm`, `xs`, `md`, `capsule` (`px`/`rem`/`em`/`%`).

## Corners from extension code

An extension can override the corners **at runtime** — handy for a panel that
toggles its own look. The override wins over the active theme, and `reset()`
gives control back to it:

```js
api.radius.set('rect')                 // type handlers receive `api`
api.radius.set({ panel: '0px' })
api.radius.reset()                     // back to the theme's value

window.scrakk.radius.set('rect')       // .sef bundle components (no imports)
window.scrakk.radius.reset()
```

Values are validated exactly like in the JSON, so an extension cannot inject
arbitrary CSS. The API reference for the same surface is
[Scrakk API](../reference/api.md).

## Activate

Themes are listed in **Settings → Appearance** (or the theme picker). `type`
decides whether it groups as light or dark. It applies live.

## Next steps

- [Icons](icons.md) — file and UI icon themes.
- [Contributes](../reference/contributes.md) — the rest of the kinds.
