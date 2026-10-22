---
title: "Changelog 0.1.6"
group: changelog
order: 50
summary: "Relevant changes in Scrakk Studio. The welcome screen shows the first entry (the newest) in the Announcements section, so the newest goes on top."
---
# Changelog

Relevant changes in Scrakk Studio. The **welcome screen** shows the first
entry (the newest) in the **Announcements section**, so the newest goes on top.

Format: `## <version> — <title>` and bullets per area. Entries already
published are not edited. The file goes per version:
`docs/changelog/changelog-<x.y.z>.md`.

---

## 0.1.6 — A correct grid, a real colour picker and quiet tooltips

### Editor (Innerta)
- **The editor's cell metrics were wrong until you touched the zoom.** The
  layout cache booted with its placeholder values (an 18px row and a 9px column)
  while the font atlas already knew the real ones (a 23px row for the 15px
  editor font). Every line was therefore **5px too tight**: the text overlapped
  its own descenders, and everything that is centred on the row — the caret,
  the fold chevron, the gutter icons, the minimap — sat 2.5px off. The only
  thing that made it look right was pressing `Ctrl+` and then `Ctrl-`, because
  *that* is the path that recalculated the metrics: the zoom was not fixing
  anything, it was waking the grid up. The metrics now **always follow the
  font**, so the editor is correct from the very first frame, and a metrics
  change also invalidates the cached text layouts (their key did not include the
  metrics, so they kept the old positions and the glyphs drifted to the right).
- **Room for three-digit line numbers.** The gutter reserved the icon column
  (bookmark + fold chevron) out of the space meant for the digits, so the
  number ended up touching — or being clipped by — the left edge of the window
  as soon as the file had three-digit lines (worse with four). The gutter now
  reserves the digits properly and keeps a **10px margin** from the edge, for
  any number of digits, and the same formula is used by the editor and by the
  gutter renderer so they cannot drift apart.
- **Changing the terminal font no longer leaves a stale grid behind.** The
  terminal font is loaded into the same atlas the editor draws with; the cell
  metrics are re-synced with it, so the rows stay aligned instead of keeping
  the previous font's height.

### Editor (color picker)
- **The color picker is the frontend's now.** The engine used to paint the
  little colour square next to every colour literal **and** the whole picker
  panel on its own canvas. Now the engine only publishes *where* each literal
  is (with its rectangle) and the frontend puts the skin on top: the square,
  and the panel — the saturation/value square, the hue bar, the alpha bar, the
  preview, the hex field and the buttons — with the **same measurements as
  before**, but as DOM: it uses the app's theme, it scales with the UI and it
  can be restyled without touching C++. The engine keeps what is really its
  own: parsing the literal, knowing its format and writing the colour back
  into the buffer — so an `rgb()` stays an `rgb()` and a `#RRGGBB` stays a
  `#RRGGBB`.
- **And it writes the colour.** The engine publishes the literals with short
  keys (`l`, `cs`, `ce`, `f`) and the frontend was reading them with the long
  ones, so every field arrived as `undefined`: the panel opened on a `NaN`
  colour and **Apply** sent `undefined` to the engine, which found no token and
  wrote nothing — the colour moved in the panel and the hex in the text never
  did. The mapping is now explicit, and a real test (not a source scan) pins it
  with the exact JSON the engine produces.
- **And the text changes while you drag.** The picker writes the colour into
  the buffer as you move — the saturation/value square, the hue bar, the alpha
  bar — instead of waiting for **Aplicar**: the literal in the code follows
  the pointer in real time. **Cancelar** puts the original colour back.
  Because the text changes while the pointer moves, the engine re-reads the
  literal from the live text on every write (the cached span was already one
  character short by then: `#fff` had become `#ffffff`), and the writes are
  throttled to one per frame so dragging stays smooth.

### Command palette (UI)
- **The shortcuts look like the welcome page's badges.** Every command in the
  palette (and in its tooltip) was showing its keybinding as a **keycap**: a
  boxed chip with a full border, a filled background and 10px text — the same
  shape as a physical key, which read as a *button* inside a list of commands.
  They now use the **same badge as the welcome page** (`.tip-combo` /
  `.action-badge`): no full border, only a hairline underneath, transparent
  fill, 9px text with a little letter-spacing and the muted colour, and the
  smallest radius. The shortcut sits quietly at the end of the row instead of
  competing with the command's own title, and the palette, the welcome tips and
  the action cards finally speak the same visual language.

### Terminal (settings)
- **The section is a real terminal, not a drawing of one.** The static mock
  preview (a coloured prompt painted with the chosen font) is gone: Settings
  now mounts a **live Innerta session in terminal mode** — the same session the
  terminal tabs use, with a real PTY — so what you see is the actual engine,
  the actual shell and the actual prompt. Choosing another font retypes it
  **live** (the session's font is reloaded in place), and the preview is
  destroyed when you leave the section, so no shell is left running in the
  background. The embedded session is created with `autoFocus: false`; the
  terminal of a tab still takes the focus, but the preview does not steal it
  from the settings navigation.
- **The selectors lost their box.** Both pickers were native `<select>`s: a
  bordered control with the operating system's own dropdown, which looked
  nothing like the rest of Settings. They are now flat rows (the same surface
  and hover as **Apariencia** and **Servidores LSP**) with a text value and a
  **ProductIcon chevron** (so the icon theme can override it), and the choice
  opens the app's **global context menu** — checks, sublabels with the
  executable path and separators included. No borders, no native popup.
- Switching the shell restarts the preview (a PTY keeps the shell it was born
  with); typing a custom path does not restart it on every keystroke — that
  change still applies to new terminals, as the row's hint says.

### Terminal (Windows)
- **The terminal opens the shell you actually use.** It always came up as
  `cmd.exe`: the shell was resolved from `ComSpec`, which is the legacy command
  processor and never points at PowerShell, and the `shell` field of the create
  request was never sent by the renderer. The shell is now resolved from the
  system, in this order: the choice in **Settings → Terminal**, otherwise the
  **default profile of Windows Terminal** (when it is the default terminal),
  otherwise `pwsh.exe` → `powershell.exe` → `cmd.exe`, the first one in the
  `PATH`. On POSIX nothing changes (`$SHELL`).
- **The `cd` of a workspace change speaks the shell's language.** Changing the
  workspace does not recreate the terminal — it writes a `cd` to the PTY — and
  that command was cmd.exe's syntax (`cd /d "…"`), which PowerShell rejects
  (*"A positional parameter cannot be found that accepts argument"*). The main
  process now keeps the family of the shell each PTY was opened with:

  | Shell | Command |
  |---|---|
  | `cmd.exe` | `cd /d "C:\path"` |
  | PowerShell | `Set-Location -LiteralPath 'C:\path'` |
  | POSIX | `cd -- '/path'` |

  In cmd.exe a path with `&`, `|`, `^` or `%` is still **rejected** instead of
  escaped (there is no safe quoting there); in PowerShell the single quotes make
  those characters literal, so only the quote itself is escaped (doubled). A
  POSIX shell on Windows (Git Bash) gets the MSYS form (`/c/Users/dev`), and a
  shell whose syntax is unknown gets **no** `cd` instead of a wrong one.
- **The console font is read again on Windows.** The registry query went
  through `cmd.exe` with the key escaped wrong (`HKCU\\Console` is not a valid
  key name), so every call failed and printed *"ERROR: Invalid key name"* in the
  console on every launch: the family and the size were never really read.
- **The tab title is not the path of the shell.** PowerShell announces its own
  binary in the OSC 0 title when it starts, and the tab took it literally (a
  long path instead of the program name). The parser now ignores a title that
  is the path of an executable; a real title (`vim`, `lazygit`, the cwd) is
  untouched.
- **Settings → Terminal is navigable again.** The section was hidden when the
  font picker was its only content; it now carries the **shell picker** (auto,
  the shells detected on the machine and a free-text path), which is where you
  choose the shell a new terminal opens with.

### Themes (ANSI palette)
- **The terminal palette belongs to the theme, not to the engine.** The sixteen
  ANSI colors (`\e[31m`, `\e[97m`, the 256-color cube's first sixteen …) were a
  fixed table inside the engine, tuned for a dark background. On a light theme
  that meant `white` was `#e5e5e5` and `bright white` was `#ffffff` on a `#e3e3e3`
  background: **invisible** — programs that print in white (prompts, `git diff`,
  `\e[37m`) looked like they were missing chunks. The palette is now a theme
  token, so switching themes switches the terminal palette with it.
- **Two ways to write it, on purpose.** A theme can carry the palette inline
  (`"ansi": { "red": "#cd3131" }` in `theme.json`) or in an **`ansi.json` next to
  the theme JSON** (same object, no wrapper) — the file wins slot by slot when
  both exist, and keeps a long palette out of the main file. No new manifest
  field: the file is found by convention, for built-in themes and for installed
  `.sef` packs alike.
- **Partial palettes inherit.** A theme that defines no `ansi` takes the one from
  the base of its type (`scrakk-night` for dark, `scrakk-day` for light) slot by
  slot, the same rule the colors already followed. `scrakk-day` ships the light
  palette (`white` and `bright white` are `#6e7781` and `#24292f`, as in GitHub
  Light), and `scrakk-night` pins the previous dark values, so dark themes look
  exactly as before.
- **VS Code themes keep their terminal colors.** The importer now maps
  `terminal.ansiBlack` … `terminal.ansiBrightWhite` to the new `ansi` block: an
  imported theme brings its own palette instead of silently falling back.
- **The palette is also a CSS variable** (`--ansi-red`, `--ansi-bright-white`,
  …), so UI that has to paint a color the terminal would paint does not keep a
  second, drifting copy.

### Social (UI)
- **The composer goes back to its compact height when the panel grows.** The
  textarea only refit itself when the text changed, so opening the panel at its
  minimum width and widening it afterwards left the field stuck at the taller
  two-line height. A `ResizeObserver` now refits it when its width changes.

### Tooltips (UI)
- **A tooltip stays put while the pointer is on it.** The hover an LSP sends —
  the diagnostics under the cursor, the type of a symbol, the documentation of a
  function — is content to **read**, and often to copy from. Moving the pointer
  onto it used to kill it: the editor had already lost the pointer (it was over
  the tooltip, not over the code), so the hover timer fired and the tooltip
  disappeared while you were still reading it. The tooltip is now **pinned**
  while the pointer is on top of it: it stays until the pointer leaves it, or
  until you click or scroll. It is also placed **beside** the pointer instead
  of under it, and it flips below when there is no room above.
- **Scrolling a long tooltip no throws it away.** The scroll listener was in
  capture mode (scroll events do not bubble), so the tooltip's own scroll was
  read as "the page scrolled" and killed the hover — and, with the tooltip
  gone, the wheel went on to scroll the editor underneath. A scroll that starts
  inside the tooltip is now ignored, and the wheel over the tooltip no longer
  reaches the editor.

### Installation (Linux)
- **Scrakk Studio is now an APT package.** Debian/Ubuntu users can add the
  signed repository at `apt.scrakk.art` and install with `apt install
  scrakk-studio`; updates then arrive through `apt upgrade` like any other
  package. The repository is hosted on Cloudflare Pages (the indices are a few
  KB; the `.deb` is served from GitHub Releases, so nothing is stored in R2
  and the 25 MB per-file limit of Pages is never hit) and signed with a
  dedicated GPG key. The `.deb` declares its runtime dependencies
  (`libnss3`, `libgtk-3-0`, …) so a clean Ubuntu installs everything it needs.

### Website (scrakk.art)
- **The download button takes you to the GitHub releases page.** It used to
  resolve the right asset for your OS and start the download on the spot —
  an AppImage landing straight in the downloads folder, with no chance to read
  the release notes or pick a different build. Now the button opens the
  releases page, where the platform, the format and the notes are all one click
  away.
- **The documentation is live at 0.1.5.** The published bundle had been left
  at 0.1.4: `docs.scrakk.art` now serves the 0.1.5 docs, including the full
  changelog.

### Development
- **The release pipeline is green again.** Two things were silently blocking
  the builds: the strict i18n gate failed on 33 English keys whose source hash
  had never been recorded (the translations were there, only the bookkeeping
  was missing), and the Windows test run failed on four tests that hardcoded
  POSIX paths. Both are fixed, and the release for 0.1.5 went out with Linux,
  Windows and the installers.
- **New engine test target (`InnertaMetricsTests`).** It pins the two
  regressions above: the cell metrics must follow the font atlas, and the
  gutter must leave room for the line numbers.
- **The colour picker is tested with the data, not with the source.** The JSON
  the engine publishes is parsed in a test, with the exact shape the engine
  emits: a source-shape check cannot tell that a field is arriving as
  `undefined` — which is exactly how the colour stopped reaching the text.
