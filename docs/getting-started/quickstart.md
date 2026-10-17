---
title: "Quick start"
group: start
order: 30
summary: "Open a folder, connect a model in Settings → Chat → Providers, send the first chat message, and a short map of the built-in panels (explorer, chat, editor, terminal, problems)."
---
# Quick start

This walks through a first session: open a folder, connect an LLM, send a chat
message, and find your way around the built-in panels. Everything below is
composed in `src/renderer/src/app/App.tsx`.

## 1. Open a folder

Use **File → Open folder**, run the command *Open folder* from the command
palette (`mod+shift+p`), or call it from the explorer panel. Internally it calls
`window.api.fs.pickFolder()` and sets the workspace root with
`setWorkspaceRoot()`; the explorer updates from there.

Key bindings you will use immediately:

| Action | Keys | Command id |
|---|---|---|
| Command palette | `mod+shift+p` | `palette.open` |
| Save active file | `mod+s` | `file.save` |
| Open Settings | `mod+,` | `app.openSettings` |
| Go to definition | `f12` | `editor.goToDefinition` |
| Expand selection | `shift+alt+right` | `editor.expandSelection` |

## 2. Connect a model

Open **Settings → Chat → Providers** (`settings.nav.providers`), or run the
*Open LLM providers* command (`providers.open`). There you add provider API keys
and pick the active provider/model. The catalog comes from **models.dev**
(`startProviderCatalog()` in `src/renderer/src/features/providers`).

- Scrakk ships the default **DeepSeek V4 Flash**, so the chat works out of the
  box; the Providers panel is where you switch provider/model and add keys.
- The selection (provider/model/thinking mode/variant) is persisted under the
  localStorage key `scrakk-studio:providers`. **API keys are not**: they live in
  the main process, encrypted with the OS keychain (`safeStorage`); the renderer
  only receives `providerId → hasKey`. Without a real keyring the key stays in
  memory for the session and is not written to disk. Non-React code reads the
  selection through `readProviderSettings()` / `activeProviderSelection()`.
- Related sections live under the same **Chat** group: Tools, Skills, Agents and
  Permissions.

## 3. First chat

Click the **Chat** button in the right activity bar (the panel is permanent: no
X). Type a request; the agent can read and edit files and run commands, subject
to the **policy engine**. That engine combines modes and allow/ask/deny rules —
see [Modes and permissions](../chat/permissions.md). Inputs starting with `/`
run **slash commands** (see [Slash commands](../chat/slash-commands.md)).

On first launch an **onboarding wizard** is shown; reopen it later with the
*View initial setup* command.

## 4. Panel map

The layout is modular: four slots (`left`, `center`, `right`, `bottom`) and any
registered panel can be mounted in any of them (`features/layout`). Built-in
panels are declared in `features/layout/registry.tsx`; extension panels register
in the same registry at runtime.

| Area | Where | Notes |
|---|---|---|
| **Explorer** | left activity bar (order 10), permanent | Workspace file tree |
| **Editor** | center slot | One tab per open file (`features/editor`) |
| **Chat** | right activity bar (order 10), permanent | Agent harness; embeds the history view |
| **Terminal** | bottom slot | View → Terminal toggles `innerta-terminal` |
| **Problems** | status bar chip | Counts errors/warnings from LSP + extensions |
| **Search / Git / Debug** | activity bar (left 20 / right 30 / left 40) | Search, git panel, debug |
| **Extensions / Social / Notes** | activity bar | Extensions is a left slot; Social and Notes on the right |

The bottom **status bar** holds the LSP chip, cursor position, the command
search bar, notifications and the settings gear.

## Limits

- The **Extensions panel is an empty shell** today (title only); installing a
  `.sef` is done from **Settings → Extensions**. See
  [SEF extensions](../extensions/README.md).
- There is **no activity-bar button for the terminal or Problems**; the terminal
  is toggled from the View menu (bottom slot) and Problems from the status bar
  chip.
- The **History** panel has no button either: it is embedded inside the Chat
  panel (the registry entry exists only so it stays mountable/testable).
- Provider keys are **not** in localStorage: the main stores them with
  `safeStorage` (memory-only when no real keyring is available).

## Next steps

- [Modes and permissions](../chat/permissions.md) — what the agent may do.
- [Languages](../editor/languages.md) — how syntax and LSP reach Innerta.
- [Project structure](project-structure.md) — repository layout.
