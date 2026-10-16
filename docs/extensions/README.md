---
title: "SEF extensions"
group: extensions
order: 10
summary: "Everything about the Scrakk Extension Format (SEF): what an extension can contribute, how to create, package and install one, and how it works under the hood."
---
# SEF extensions

An **extension** adds functionality to Scrakk Studio —a panel, a theme, a button,
an AI tool— **without touching the app**. You describe it in a `manifest.json`
and Scrakk registers it. The format is called **SEF** (*Scrakk Extension
Format*).

There are **two sources** for the same contract:

- a **builtin** (compiled into the app bundle, under
  `services/extensions/builtin/<type>/<id>/`), or
- a **`.sef`** installed by the user (a **ZIP** extracted into
  `userData/extensions/<id>/`).

Scrakk's own installable extensions — the first-party catalogue, as opposed to
anyone's — live in
[`Scrakk-Team/extensions`](https://github.com/Scrakk-Team/extensions); see
[Official extensions](guides/official-extensions.md).

And **two kinds** depending on whether it runs code:

| | **Declarative SEF** | **SEF with code** |
|---|---|---|
| Where the UI comes from | the package bundle (React) | the **Extension Host**: the extension runs in its own process and serves content over IPC |
| Contribution kinds | `panels`, `activityBar`, `centerTabs`, `themes`, `fileIcons`, `productIcons`, `languages`, `lspServers`, `encodings`, `fileHandlers`, `notifications`, `events`, `tools`, `skills` | `views` (+ `runtime` in the manifest) |
| Needs Node? | no | yes |

The declarative kind **does not run your code**. The kind with code **does**, so
it goes through the Extension Host: `views` is the declarative door (the IDE
knows the panel exists **before** running anything) and the content arrives
later, from the host.

---

## Quick start in 5 steps

```sh
npm install -g @scrakk-official/cli                    # 0. install the CLI (once)
sef create "My Extension" ./my-extension               # 1. scaffold (sample panel)
cd my-extension
sef build .                                            # 2. bundle → dist/modules.js
sef pack .                                             # 3. validates and writes ../my-extension.sef
sef validate .                                         # 4. (optional) validate without packing
```

5. Install the `.sef` from the **Extensions** panel (**Install .sef**), or
   [publish it to the store](guides/store.md) so anyone can install it.

> The `id` comes from the name: use **ASCII** (`"Mi Extensión"` becomes
> `mi-extensi-n` and the accent is lost; `"My Extension"` becomes
> `my-extension`). The package is created under `<dir>/<id>/` and the `.sef`
> lands **next to** that folder.

The full walkthrough is in
[Your first extension](getting-started/your-first-extension.md).

## At a glance

```text
manifest.json                     ← the source of truth (declarative)
contributes:
  panels / activityBar / centerTabs   → React UI from the package itself
  views (+ runtime)                   → UI served by the Extension Host (code)
  themes / fileIcons / productIcons   → themes (data JSON)
  languages / lspServers              → language support and language servers
  events                              → timed visual/audio experiences
  tools / skills                      → AI (tools and workflows)
  fileHandlers / encodings            → file formats and text encodings
        │
        ▼
  loader/resolve.ts  ──►  ExtensionTypeRegistry  ──►  ExtensionRegistry
   (generic: knows no types)        (one handler per type)      (the app reads it)
```

---

## Getting started

| Document | What it covers |
|---|---|
| [Your first extension](getting-started/your-first-extension.md) | Full tutorial: panel + button + tab, from zero to an installed `.sef`. |

## Guides (task oriented)

| Document | What it covers |
|---|---|
| [Panels](guides/panels.md) | A React component in any layout slot. |
| [Activity bar](guides/activity-bar.md) | The bar button that opens a panel. |
| [Center tabs](guides/center-tabs.md) | A tab in the center strip. |
| [Views (with code)](guides/views.md) | An activity bar panel served by the Extension Host. |
| [Color themes](guides/themes.md) | The theme JSON and its tokens. |
| [Icons](guides/icons.md) | File icon themes (`fileIcons`) and UI icon themes (`productIcons`). |
| [Languages](guides/languages.md) | Language kit: association, tree-sitter/TextMate grammars, snippets. |
| [Language servers](guides/lsp-servers.md) | Declaring an `lspServers` entry and making it run. |
| [AI tools](guides/tools.md) | Contributing a tool: schema, command and visual. |
| [Events](guides/events.md) | A timed experience: scene JSON, schedule window and ops. |
| [Skills](guides/skills.md) | Packaging workflows (Agent Skills standard). |
| [Formats and encodings](guides/file-handlers.md) | `fileHandlers` (your viewer) and `encodings` (your codec). |
| [Permissions](guides/permissions.md) | The deny-by-default model and the path jail. |
| [Packaging](guides/packaging.md) | The `.sef` layout, the bundle and how it is installed. |

## Reference

| Document | What it covers |
|---|---|
| [Manifest](reference/manifest.md) | Every field of `manifest.json`. |
| [Contributes](reference/contributes.md) | The **15** contribution kinds with their real fields. |
| [SEF CLI](reference/cli.md) | `sef create/build/pack/validate` and the v2 layout. |
| [Scrakk API](reference/api.md) | What a handler receives: `fs`, `lsp`, `tooltips`, `notifications`, `radius`. |
| [Extension API (vscode)](reference/vscode-api.md) | The emulated `vscode.*` surface and its real status. |
| [Builtin](reference/builtin.md) | Creating an extension that ships inside the app. |

## Architecture

| Document | What it covers |
|---|---|
| [How it works](architecture/overview.md) | Boot, the generic loader, the registry and the types. |
| [Extension Host](architecture/extension-host.md) | The process that runs the code and how it talks to the IDE. |
| [VS Code compatibility](architecture/vscode-compatibility.md) | The VSIX → SEF pipeline and what gets translated today. |
