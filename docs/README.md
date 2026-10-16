---
title: "Scrakk Studio — Documentation"
group: start
order: 0
summary: "Entry point to all Scrakk Studio documentation: what it is, how to start, and the full map of every area."
---

# Scrakk Studio — Documentation

**Scrakk Studio** is an agentic IDE: an editor (Innerta) with an AI chat,
subagents, extensions (`.sef`) and LSP, built so an agent works *inside* the
editor, not next to it. This file is the **entry point**: it explains what there
is and in what order to read it.

> If you are an AI consuming these docs: the machine-readable index is in
> `index.json` (nav + metadata), the full corpus in `llms.txt` and `docs.json`,
> and each doc is served raw at `md/<slug>.md`. All under
> [`docs.scrakk.art`](https://docs.scrakk.art) and
> `api.scrakk.art/api/docs`.

## Quick start

1. **Install** the app (GitHub release: AppImage/deb on Linux, installer on
   Windows).
2. **Open a project**: *File → Open folder*.
3. **Connect a model**: Settings → Models (local or API). Without a model, the
   chat has nobody to ask.
4. **First chat**: type in the chat panel; the agent can read/edit files and run
   commands subject to the **permissions** ([Modes and permissions](chat/permissions.md)).
5. **Extensions**: Settings → Extensions to install a `.sef`, or read
   [the extension system](extensions/README.md) to create one.

## Documentation map

### Getting started
| Document | What it covers |
| --- | --- |
| [Install](getting-started/install.md) | Getting the app (releases + building from source). |
| [Quick start](getting-started/quickstart.md) | Open a project, connect a model, first chat. |
| [Project structure](getting-started/project-structure.md) | The repo layout (main / preload / renderer / shared). |
| [Updates](updates.md) | How the IDE detects, downloads and installs a new version (release → Supabase → Realtime). |

### AI chat
| Document | What it covers |
| --- | --- |
| [AI chat](chat/chat.md) | The chat panel: sessions, streaming, tool cards, message actions. |
| [AI tools](chat/tools.md) | The built-in tools the agent can call, and the tool registry. |
| [Subagents](chat/subagents.md) | The `task` tool and subagent sessions. |
| [Models & providers](chat/providers.md) | The models.dev catalogue and provider settings. |
| [Modes and permissions](chat/permissions.md) | Modes (primary/subagent), deny-by-default permissions and approvals. |
| [Slash commands](chat/slash-commands.md) | The chat's `/command` commands. |

### Editor (Innerta)
| Document | What it covers |
| --- | --- |
| [The editor](editor/editor.md) | Tabs, splits, the engine-per-panel model, minimap, bookmarks, zoom. |
| [Editor decorations](editor/decorations.md) | Range underlines and decorations the editor paints. |
| [Innerta as a surface](editor/innerta-bridge.md) | The Innerta ↔ Scrakk contract: who owns the UI. |
| [Languages](editor/languages.md) | How an extension adds syntax (VS Code → SEF → Innerta). |
| [Completion](editor/completion.md) | The completion suggestions list. |
| [Diff tabs](editor/diff.md) | Read-only diff tabs (git + AI edits). |
| [Editor screenshots](editor/screenshots.md) | How it is verified that the editor paints. |

### Extensions (SEF)
| Document | What it covers |
| --- | --- |
| [SEF extensions](extensions/README.md) | The two kinds (declarative / with code) and the area index. |
| [Your first extension](extensions/getting-started/your-first-extension.md) | Full tutorial: from zero to an installed `.sef`. |
| [Manifest](extensions/reference/manifest.md) | `manifest.json`: every field. |
| [Contributes](extensions/reference/contributes.md) | The 15 contribution kinds, with examples. |
| [SEF CLI](extensions/reference/cli.md) | `sef create/build/pack/validate` and the package layout. |
| [Extension API](extensions/reference/vscode-api.md) | The emulated `vscode.*` surface and its status. |
| [Builtin](extensions/reference/builtin.md) | Extensions compiled inside the bundle. |
| [Panels](extensions/guides/panels.md) | React panels in a layout slot. |
| [Activity bar](extensions/guides/activity-bar.md) | The bar button that opens a panel. |
| [Center tabs](extensions/guides/center-tabs.md) | Tabs in the center strip. |
| [Views (with code)](extensions/guides/views.md) | Panels served by the Extension Host. |
| [Themes](extensions/guides/themes.md) | Color themes. |
| [Icons](extensions/guides/icons.md) | File and UI icon themes. |
| [Languages](extensions/guides/languages.md) | The language kit (grammars, snippets). |
| [Language servers](extensions/guides/lsp-servers.md) | Declaring an `lspServers` entry. |
| [AI tools](extensions/guides/tools.md) | Tools an extension contributes to the chat. |
| [Skills](extensions/guides/skills.md) | Skill packs (Agent Skills standard). |
| [Formats and encodings](extensions/guides/file-handlers.md) | `fileHandlers` and `encodings`. |
| [Permissions](extensions/guides/permissions.md) | The deny-by-default model and the path jail. |
| [Packaging](extensions/guides/packaging.md) | The `.sef` package and installation. |
| [VS Code compatibility](extensions/architecture/vscode-compatibility.md) | The VSIX → SEF pipeline and what is translated. |
| [How it works](extensions/architecture/overview.md) | Boot, loader, registry. |
| [Extension Host](extensions/architecture/extension-host.md) | The process that runs extension code. |

### Language Server (LSP)
| Document | What it covers |
| --- | --- |
| [LSP system](lsp/README.md) | Area index and overview. |
| [Architecture](lsp/architecture.md) | How the LSP client is orchestrated in the main. |
| [API](lsp/api.md) | The full surface for frontend/editor/agent. |
| [Configuration](lsp/configuration.md) | `.scrakk/lsp.json`. |
| [Servers](lsp/servers.md) | Builtin, detection and auto-install. |
| [Providers](lsp/providers.md) | Language providers (host ⇄ IDE). |
| [Protocol](lsp/protocol.md) | Supported protocol and limits. |
| [`lspServers` extension](lsp/extensions.md) | Declaring a server from an extension. |
| [vscode-languageclient](lsp/vscode-languageclient.md) | VS Code extensions with their own server. |
| [Testing](lsp/testing.md) | LSP system tests. |

### Panels & features
| Document | What it covers |
| --- | --- |
| [Panels & features](features/README.md) | Index of the built-in panels and the feature area. |
| [Explorer](features/explorer.md) · [Search](features/search.md) · [Git](features/git.md) · [Problems](features/problems.md) · [Notes](features/notes.md) · [Terminal](features/terminal.md) · [Social](features/social.md) · [Browser](features/browser.md) · [Debug](features/debug.md) | The built-in panels. |
| [Layout & panels](features/layout.md) · [Status bar](features/status-bar.md) · [Titlebar & menus](features/titlebar.md) · [Notifications](features/notifications.md) · [Command palette](features/command-palette.md) · [Breadcrumbs](features/breadcrumbs.md) · [Tool dock](features/tool-dock.md) · [Shortcuts & commands](features/shortcuts.md) | The app chrome. |
| [Outline](features/outline.md) · [File viewers](features/file-viewers.md) · [Encodings](features/encodings.md) · [Bookmarks](features/bookmarks.md) · [File timeline](features/file-timeline.md) · [Themes & icons](features/themes.md) | Editor views and tooling. |
| [Workspaces](features/workspaces.md) · [`.scrakk` folder](features/dot-scrakk.md) · [Account](features/account.md) · [Onboarding](features/onboarding.md) · [Sessions](features/sessions.md) · [Performance](features/performance.md) · [Settings](features/settings.md) | Project, account and config. |

### Development
| Document | What it covers |
| --- | --- |
| [Contributing](dev/contributing.md) | Dev setup, scripts, tests, docs and commit style. |
| [Architecture](dev/architecture.md) | The app's process model and where each subsystem lives. |
| [i18n](dev/i18n.md) | The translation system, catalogs and tooling. |

### What's new
| Document | What it covers |
| --- | --- |
| [Changelog 0.1.4](changelog/changelog-0.1.4.md) | Changes in the latest version (also feeds the welcome screen's Announcements). |
| [Changelog 0.1.3](changelog/changelog-0.1.3.md) | Previous version. |
| [Changelog 0.1.2](changelog/changelog-0.1.2.md) | Previous version. |
| [Changelog 0.1.1](changelog/changelog-0.1.1.md) | Previous version. |

## Reading paths

- **New user** → *Quick start* (above) → [Modes and permissions](chat/permissions.md) → [Updates](updates.md).
- **Extension author** → [SEF extensions](extensions/README.md) → [Your first extension](extensions/getting-started/your-first-extension.md) → [Manifest](extensions/reference/manifest.md) → [Contributes](extensions/reference/contributes.md). Coming from VS Code: [VS Code compatibility](extensions/architecture/vscode-compatibility.md).
- **Language author** → [Languages](editor/languages.md) → [LSP](lsp/README.md) → [`lspServers` extension](lsp/extensions.md).
- **IDE dev** → [LSP architecture](lsp/architecture.md) → [Innerta](editor/innerta-bridge.md) → [How it works](extensions/architecture/overview.md).

## How these docs are published

These `.md` files are the **source of truth** (GitHub, `master` branch). They are
not edited on the web. On every release, a workflow:

1. builds the bundle (`tools/docs/build.mjs` → `index.json`, `docs.json`,
   `llms.txt`, `doc/<slug>.json`);
2. uploads it to **Cloudflare R2** (bucket `scrakk-docs`), versioned (`latest` + `vX.Y.Z`);
3. the **web** renders it at [scrakk.art/docs](https://scrakk.art/docs) with the
   site's style; `docs.scrakk.art` is the data host (JSON / markdown /
   `llms.txt`) and `api.scrakk.art/api/docs` the programmatic access.

Each doc's front-matter drives the navigation:

```yaml
---
title: "..."
group: extensions     # start | chat | editor | features | extensions | lsp | dev | changelog
order: 30
summary: "One line for the nav and search."
---
```
