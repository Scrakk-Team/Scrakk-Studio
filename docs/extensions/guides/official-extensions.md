---
title: "Official extensions"
group: extensions
order: 185
summary: "Where Scrakk's own extensions live: the Scrakk-Team/extensions repository, one folder per extension and one release per extension."
---
# Official extensions

Scrakk Studio ships part of its extensions **inside the app** — the built-ins:
the colour themes, the file icon theme, the terminal, the language pack — and
keeps the **installable** first-party ones in a single public repository:

**`github.com/Scrakk-Team/extensions`**

Anyone can publish their own `.sef` to the store (see
[Extension store](store.md)); this repository is simply the first-party
catalogue, maintained by the project itself. It is the same split VS Code uses
(core extensions in the app, official ones as packages), with one difference:
here the first-party ones are **installable packages**, not code inside the app
bundle.

## What lives there

| Extension | What it adds |
|---|---|
| `halloween-themes` | 12 colour themes (9 dark / 3 light), five of them with their own typeface, plus the **Halloween Night** event and its Storm background (blood moon, clouds, rain, bats, a haunted house, a graveyard and lightning) |
| `canvas` | A drawing board panel, three command-palette commands, its own theme, and an AI tool (`canvas_draw`) that draws on the same board |

```text
extensions/
├── halloween-themes/
│   ├── manifest.json          # the folder name IS the extension id
│   ├── themes/*.json
│   ├── events/*.json          # timeline of the event
│   └── overlay/*.tsx          # background/effect components the event mounts
└── canvas/
    ├── manifest.json
    └── panels/ runtime/ icons/ themes/
```

Only the **source** lives in the repository. `dist/modules.js` (the compiled UI
bundle) and the `.sef` are build artifacts: the release workflow produces them,
and `.gitignore` keeps them out of the tree.

## One release per extension

Every extension keeps its **own version**. A tag names the extension and its
version:

```sh
git tag halloween-themes@1.4.0
git push origin halloween-themes@1.4.0
```

The [release workflow](https://github.com/Scrakk-Team/extensions/blob/main/.github/workflows/release.yml)
then compiles the folder, packs it and publishes a Release whose asset is exactly
**`<id>.sef`**.

That detail matters on the app's side. A repository can host **several**
extensions, so when a store row pins an asset (`asset_name`) the resolver looks
for *the newest release that contains that asset* instead of the repository's
"latest release" — otherwise installing one extension could fetch the release of
another. The version shown in the store comes from the tag suffix
(`halloween-themes@1.4.0` → `1.4.0`).

## Installing one

- From the **store** (Extensions → Browse): they are published like any other
  extension.
- From the **release asset**: download `<id>.sef` and use Extensions →
  **Install .sef**.

## Adding an official extension

```sh
git clone https://github.com/Scrakk-Team/extensions
cd extensions
sef create "My Extension" .
sef validate my-extension
git tag my-extension@0.1.0 && git push origin my-extension@0.1.0
```

`ci` validates every folder on each push; `release` publishes on each
`<id>@<version>` tag. The authoring contract is the same as for anyone else:
[Manifest](../reference/manifest.md) and [Contributes](../reference/contributes.md).

## Next steps

- [Extension store](store.md) — publishing your own extension.
- [Packaging](packaging.md) — what a `.sef` carries.
- [SEF CLI](../reference/cli.md) — the commands and the rules.
