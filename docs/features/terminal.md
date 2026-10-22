---
title: "Terminal"
group: features
order: 90
summary: "The terminal: a builtin extension rendered by the Innerta engine, with live PTY sessions, system fonts, and an infinite node-canvas view."
---
# Terminal

The terminal is **not** built into the layout core: it is a **builtin extension**
(`innerta-terminal`) that contributes a panel, and its content is rendered by the
**Innerta engine** in terminal mode (the same engine as the editor, not VTE). It
lives in the **bottom** slot and is opened from the status bar / the terminal
buttons:

```ts
openTerminalTab('bottom')       // focus (or create) the terminal tab
openNewTerminalTab('bottom')    // the strip's "+": a new session
```

See the builtin manifest:
[`innerta-terminal`](../extensions/reference/builtin.md).

## Live sessions

A **session** (`src/renderer/src/services/innerta/terminalSession.ts`) owns three
things together: the **canvas**, the **Innerta view**, and the **PTY** (in the
main process). They are decoupled from the React mount so the shell survives:

- **`attach()` / `detach()` re-parent the canvas** — moving the terminal tab
  between slots does **not** kill the session (the WASM module and the PTY stay
  alive).
- **`dispose()`** (closing the tab) is the only thing that destroys everything.

The PTY is driven through the preload API:

```ts
api.terminal.create({ id, shell, cwd, cols, rows })
api.terminal.write({ id, data })
api.terminal.resize({ id, cols, rows })
api.terminal.destroy({ id })
api.terminal.onData(({ id, data }) => { /* … */ })
api.terminal.onExit(({ id, exitCode }) => { /* … */ })
```

## Fonts (resolved from the system)

The terminal resolves its fonts from the **machine**, per code point, so it
matches your real terminal:

- **Primary stack + size**: `getSystemFont()` / `getFontStack()` — the family and
  px the system uses (read at runtime in the main; nothing is written to disk).
- **CJK on demand**: when the buffer has kana/han/hangul, `getCjkFont()` loads the
  system CJK font once for that session.
- **Colour emoji**: `getEmojiFont()`, applied only to `\p{Emoji_Presentation}`
  code points (`✓ ❤ ☀ ⚠` stay monochrome; `⚡ ✅ ✨ 😀` get colour).
- **Settings → Terminal**: pick the family (or leave it on the system default);
  the choice is persisted (`scrakk-terminal-font`) and re-applied live.

## The shell (the program that runs inside)

The PTY needs a program to run. Which one is decided in the main process
(`src/main/terminal/shellResolver.ts`), in this order:

1. **The choice in Settings → Terminal** — wins over everything.
2. **Windows Terminal**: if it is the user's default terminal, its **default
   profile** is the shell they want to see. It is read from
   `HKCU\Console\%%Startup` (`DelegationConsole`) and, from there, from the
   Windows Terminal `settings.json` (`defaultProfile` → profile → `commandline`).
3. **The fallback**: `pwsh.exe` → `powershell.exe` → `cmd.exe`, the first one
   in the `PATH`.

On Linux and macOS nothing changes: the `SHELL` of the environment, or
`/bin/bash`.

The dropdown in Settings only offers the shells that **exist** on the machine:
they come from the Windows Terminal profiles, the `PATH` and the usual install
locations. There is also a free-text field for a path that is not listed.

Two details that cost a whole debugging session:

- The **App Execution Aliases** of `WindowsApps` (`…\Microsoft\WindowsApps\pwsh.exe`)
  cannot be `stat`ed — Node gets `EACCES` — so `fs.existsSync` says they are
  not there. They are: that is how the Store version of PowerShell is
  installed, and it leaves nothing in `Program Files`. The resolver treats
  `EACCES`/`EPERM` as "it exists".
- The Windows Terminal `settings.json` is **JSONC**: it accepts comments and
  trailing commas, so it cannot be parsed with `JSON.parse` as is.

### Moving the shell to another directory

When the workspace changes, the terminal is **not** recreated (the history and
the background processes survive): a `cd` is written to the PTY. That command
depends on the shell, because each one has its own syntax:

| Shell | Command |
|---|---|
| `cmd.exe` | `cd /d "C:\path"` |
| PowerShell | `Set-Location -LiteralPath 'C:\path'` |
| POSIX | `cd -- '/path'` |

`cd /d "…"` —the cmd.exe form— **is not valid in PowerShell**: `/d` is taken as
a positional argument and the command fails with *"A positional parameter
cannot be found that accepts argument"*. In cmd.exe a path with `&`, `|` or `%`
is rejected instead of escaped: there is no safe way to quote it there. In
PowerShell the single quotes make those characters literal, so they are allowed.

A POSIX shell on Windows (Git Bash) receives the path in its MSYS form
(`/c/Users/dev`), which is how that runtime mounts the drive.

## The node view (terminal canvas)

The bottom strip has a **"view nodes"** button that swaps the terminal for an
**infinite canvas** (`features/layout/components/TerminalNodes/`) where each live
session is a **node**:

- drag nodes, **zoom/pan** the camera, and **link** nodes through their ports
  (`terminalNodesModel`: ports, edges, connected groups);
- positions, camera and links persist in localStorage
  (`scrakk:term-nodes-pos`, `-cam`, `-links`);
- a `+` creates a new session directly on the canvas; closing a node closes its
  tab.

## Limits

- The terminal is a **PTY renderer**, not a shell manager: no split panes inside
  one terminal. The shell is the system one — or the one chosen in
  Settings → Terminal — but there are no editable profiles.
- Font metrics come from the system; if none can be resolved, the engine falls
  back to its bundled faces.
- The node view is a **view** of the sessions, not a separate terminal system.

## Next steps

- [Panels & features](README.md) — the other built-in panels.
- [`innerta-terminal`](../extensions/reference/builtin.md) — the builtin extension.
- [The editor](../editor/editor.md) — the same engine in editor mode.
