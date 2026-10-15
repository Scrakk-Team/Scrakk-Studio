---
title: "Changelog 0.1.5"
group: changelog
order: 50
summary: "Relevant changes in Scrakk Studio. The welcome screen shows the first entry (the newest) in the Announcements section, so the newest goes on top."
---
# Changelog

Relevant changes in Scrakk Studio. The **welcome screen** shows the first
entry (the newest) in the **Announcements** section, so the newest goes on top.

Format: `## <version> — <title>` and bullets per area. Entries already
published are not edited. The file goes per version:
`docs/changelog/changelog-<x.y.z>.md`.

---

## 0.1.5 — Windows fixes, UI & the extension store

### Terminal (Windows)
- **The integrated terminal now loads on Windows.** The shell was resolved with
  a POSIX-only fallback — `getShell()` returned `process.env.SHELL || '/bin/bash'`
  — so on Windows (where `SHELL` is not set) it asked node-pty to spawn a
  non-existent `/bin/bash`; the spawn threw, the `terminal:create` invoke
  rejected and the renderer dropped it silently (blank canvas, no error). The
  shell is now resolved per platform: a `win32` branch uses `%ComSpec%`
  (cmd.exe), and the home fallback uses `os.homedir()`. The workspace retarget no
  longer writes a POSIX command from the renderer: the `cd` is built by the main
  process (`terminal:cd`), emitting `cd /d "…"` on cmd.exe and the POSIX
  `cd -- '…'` on Linux. The renderer no longer hardcodes `shell: 'bash'`.
- **The terminal no longer renders huge on Windows.** Its size is a single
  number — the engine's `fontSize`, set from the system font. Linux derives a
  **logical** em px (`pt × 96/72 × text-scaling`, ≈13); Windows returned the raw
  `HKCU\Console\FontSize` — the console's **cell height in device pixels** (16 by
  default, larger on HiDPI) — and fed it straight into the font rasteriser, so the
  whole terminal scaled up (worse at 125/150%). `windowsConsoleEmPx` now
  normalises device→logical and cell→em, and the handler passes the monitor's scale
  factor; only the number changes, the engine re-derives the cell metrics from it.
  Separately, the node-canvas zoom was pushed into every session and never reset,
  so a plain terminal tab kept the canvas zoom (up to 2×) after leaving the node
  view; it resets to 1 now.

### Syntax highlighting (Windows)
- **Hardening of the highlight path.** For the preinstalled languages the only
  colour source is the **dynamic tree-sitter worker** (the engine no longer embeds
  grammars, and `editor.highlightSource` defaults to tree-sitter), and its
  failures were silent — if it produced nothing, no error surfaced and the editor
  showed plain text. Two Windows-sensitive spots were fixed:
  - A `.gitattributes` now forces **LF** for the tree-sitter `.scm` queries. On
    Windows, a checkout with `core.autocrlf=true` wrote them with CRLF; the worker
    passes each query verbatim to `new Query(...)`, which fails, and that category
    silently loses its colour.
  - `assertGrammarPathAllowed` is now **case-insensitive on Windows**, so a mere
    path-case mismatch between the renderer and the real root no longer rejects
    the grammar (which also left the file uncoloured, silently).

### Syntax highlighting (any distro — found on Arch)
- **An installed extension could steal a file from the preinstalled language
  pack and leave it unpainted.** The pack (`scrakk.langs`) registers **last**,
  but the file↔language tie-break kept the **first** registered when two
  languages declare the same extension/glob/filename — so a language extension
  (a VS Code `.vsix`, say) that also declares `.js`/`.py`/… won the file. If it
  only shipped a `.tmLanguage`, the tree-sitter layer never ran: with the engine
  set to **tree-sitter** the file had no colour and no error. Ties now go to the
  preinstalled pack; a *more specific* pattern still wins.
- **The "why is this file not painted" reason is no longer invisible.** It was
  logged with `console.debug` (hidden unless DevTools is on *Verbose*) and one
  message actually lied — `the chosen engine is TextMate` when the real cause was
  "you chose tree-sitter and this language has no `.wasm`". The unexpected cases
  now log at `warn`, naming the extension that won the file, and a disabled
  extension is no longer skipped in total silence.
- **The dynamic tree-sitter worker no longer loses the first request** — the
  "sometimes there is no colour, sometimes there is". Two fixes in the worker
  manager: the first `postMessage` now waits for the process to be **spawned**
  (a message posted before the child existed was lost, and the request then died
  on its timeout), and the **first** request after a cold start gets a longer
  timeout (25 s) — loading the tree-sitter runtime plus a grammar can take far
  longer than the 10 s a warm request needs. The worker's **stderr is forwarded**
  now (prefixed `[tree-sitter]`), so failing to load a `.wasm` or compile a `.scm`
  is visible instead of silent.
- **A packaged build had NO colour at all: the worker could not load its
  dependency.** The dynamic tree-sitter worker runs from `app.asar.unpacked` (so
  the OS can execute it) and its bundle `require`s `web-tree-sitter`, which was
  left **inside** `app.asar` — Node never resolves into `app.asar` from an
  unpacked path, so the worker died at startup with `Cannot find module`,
  published no tokens and the editor stayed plain (the shipped engine has no
  embedded grammars, so there is no fallback). Development worked because there is
  no asar there. `web-tree-sitter` is now in `asarUnpack`.

### App icon (Windows)
- **The packaged app now shows the Scrakk icon instead of Electron's.** The
  window icon points at `assets/scrakk-studio-b.png`, but `assets/` was excluded
  from the bundle, so in a packaged build that path did not exist and the window
  had no icon — Windows fell back to the default Electron one. The asset is now
  copied to `resources/`.
- **…and a packaged Windows build was *still* showing Electron's.** The icon
  path pointed at `build-resources/icon.png`, but `build-resources/` is in
  `.gitignore`: the file never reached CI, so electron-builder logged `default
  Electron icon is used` and the `.exe` (taskbar/alt-tab) shipped with Electron's.
  It only looked right on a local build, where the file happens to exist on disk.
  The icon is now `assets/scrakk-studio-b.png` — tracked, and the same image the
  window paints — used by all three platforms.

### Status bar (UI)
- **The errors/warnings chip now sits to the right of the commits chip.** It was
  to its left, so the problems count and the Git branch appeared in the opposite
  order from what was expected; the row now reads LSP · commits · problems ·
  cursor · encoding.
- **The errors/warnings chip is hidden when no file is open.** With no editor on
  screen there is nothing to report, so the chip no longer shows a bare "0 / 0";
  it appears again as soon as a file is opened.
- **The notifications panel is now paginated.** The bell popover listed every
  active and dismissed notification in one long scroll; it now shows **5 cards
  per page** with a footer (`‹ 1 / 3 ›`), keeping the Active / History headings
  on the page where each group starts. The "Clear" button stays with the History
  heading.
- **The status dots are now rounded squares.** The LSP state dot and the Git
  status dot on the left of the bar were circles; they are now small squares
  with rounded corners (`border-radius: 2px`), matching the squared shape used
  by the surrounding chips.
- **The command trigger no longer overlaps the other chips.** It was absolutely
  centred with a fixed `min-width: 220px`, so on a narrow window it ran into the
  chips on the left (encoding, cursor position) and on the right. It now measures
  the real gap between both groups and uses the whole gap — if there is room to
  the right it does not shrink — and once the width hits the cap it slides left
  until it sits next to the left chips. Past that it becomes an icon-only button
  like the bell/settings, and it is not painted when there is no room at all.

### Workspaces (titlebar)
- **The workspace history is paginated.** The popover was a `max-height: 320px`
  scroller, so a long history turned it into a scroll box; it now shows **6 cards
  per page**, and the pager lives in the header (see below).
- **The pager sits in the popover header**, next to the "Workspaces" title, and
  its arrows are the ContextMenu chevron SVGs instead of text glyphs. For that,
  an anchored modal can now opt out of the host's title bar (`hideHeader`) and
  paint its own: the header is rendered outside the body component, so a pager
  up there could not otherwise share its page state with the list.
- **The cards are compact and borderless.** The 1px border is gone and each card
  shrank — padding `8px` → `4px 6px`, radius 12 → 8, name 13 → 12px, path
  11 → 10px, folder icon 15 → 13px — so more of them fit per page.
- **The "Add workspace" button is a menu-style row, not a full-width bar.** It no
  longer spans the popover (`width: 100%`), it is smaller, it sits at the bottom,
  and its hover now matches the ContextMenu items: a `--color-hover` block with
  the text going to full colour.
- **The "ACTIVO" badge is gone.** The active workspace is still marked by the
  accent tinted background (and `aria-selected`), so the label was redundant.

### Panels (UI)
- **The resize handle converts instead of switching.** On hover it shows the
  three dots; pressing used to swap them for the line in a single frame. The dots
  now **stretch and merge into the line** (~150ms) and go back to dots on release,
  with the line settling on top — so it reads as one liquid movement. Respects
  `prefers-reduced-motion`.
- **The panel corners are dynamic.** They were hard-coded in the layout
  (`--radius-md`). A theme now sets them from its JSON — `"radius": "rect"` for
  square chrome, `"round"` for the system radii, or a map per slot
  (`{ "panel": "16px" }`). An extension can also override them **at runtime**
  (`api.radius.set('rect')` / `reset()`, plus `window.scrakk.radius` for `.sef`
  bundles), so a panel can toggle its own look. Values are validated (no CSS
  injection) and a `reset()` always yields back to the active theme. Three
  builtin themes ship it: **OpenCode AI** with `"radius": "rect"`, **VS Code Dark
  Modern** with *reduced* corners (`{ panel: 8px, input: 6px, sm: 5px, xs: 4px }`)
  and **Discord** with *bigger* ones (`{ panel: 16px, input: 12px, sm: 10px,
  xs: 6px }`). The welcome page,
  the **tool-dock pill**, the **activity-bar buttons** (hover and active
  included), the **status-bar chips** (all with the same radius as the command
  trigger) and the small controls (via a new `--radius-xs`) follow it too; round
  **shapes** — avatars, the presence/resize dots and the tip pills — keep their
  form on purpose.

### Extensions
- **Declarative extensions can now add palette commands and answer AI tools.**
  Until now the only path to run an extension's code was the Extension Host, so
  an extension with no `runtime` (just a panel, a theme…) could not execute
  anything: its `tools` went to a host that did not exist and there was no way to
  put a command in the command palette at all (the palette only reads the app's
  registry, and the host's `command/registered` event was never consumed). A
  bundle now registers both from its own top level:
  `window.scrakk.commands.register({ id, title, run })` (namespaced with the
  extension id) and `window.scrakk.tools.register(command, run)`. Registration is
  attributed to the extension that was being loaded and withdrawn when it is
  uninstalled or disabled, so no ghost commands survive. With a `runtime` the
  command still goes to the host, exactly as before.
- **An installed `.sef` with a panel now actually loads.** It was blocked twice.
  First, the loader imported the bundle as a **`data:` URL**, which the renderer's
  CSP does not allow (`script-src 'self' blob: …`): the import died with
  `Failed to fetch dynamically imported module: data:text/javascript;base64,…` and
  the panel never appeared. Bundles are now imported from a **blob URL** (what the
  policy does allow), verified in Chromium with the app's own CSP. Second, the
  bundle leaves `react` (and `@features/layout`) as **bare specifiers**, which a
  `data:`/`blob:` module cannot resolve either (`Failed to resolve module specifier
  "react/jsx-runtime"`); the loader rewrites them to modules built from the app's
  **real** React and layout namespaces, so the extension shares the app's React
  (hooks keep working) and the layout hooks are importable. Those modules are
  generated at runtime on purpose: a plain `export * from 'react'` re-exporter gets
  tree-shaken down to nothing in the production build (its exports are unused *in
  the app*), and then an extension cannot import `useState`/`jsx` at all.
  `window.scrakk` is the bridge for everything else.
- **Removed the builtin Clock extension** (`panels/clock`). It shipped in every
  build and contributed a side panel, an activity-bar button and a "Dashboard"
  center tab; now it is gone from all builds.
- **Theme fonts actually apply now.** `fonts.ui.source` was always linked as a
  `<link rel="stylesheet">`, so a **font file** — which is exactly what the themes
  guide documents (`.woff2`) — was parsed as CSS, failed, and the UI kept its old
  typography. A font file now gets its own `@font-face` written for it, and a
  stylesheet (Google Fonts `/css2?…`) keeps working.

### Notes
- **A note now carries its own config.** Each note is **global** (visible in
  every project) or **project** (visible only in the project that owns it), and
  you decide **per note** whether the **AI may read, edit or delete** it. The
  panel shows the scope selector and the three toggles above the editor, and a
  project note stops appearing once you open another project. Existing notes are
  migrated (global, AI read/edit on, delete off).
- **New AI tool `notes`** so the agent can list, read, create, update and delete
  notes. It runs on a dedicated API (`@services/notes`) that enforces the scope
  and the per-note permissions **before** touching the store: a denied action
  returns an error the model cannot override, and it is told to ask you to change
  it in the panel instead. In read-only modes (Plan) it can read but not write.

### Social panel
- **Fixed the sections collapsing as the friend list grows**: the panel's
  scroll container is a flex column and the sections had `min-height: 0`, so as
  flex items they shrank below their content once the list grew — the rows
  overflowed and overlapped the next section title (Requests / Friends / Add a
  friend). They are now pinned to their content (`flex-shrink: 0`) and the
  container scrolls instead.
- **"Add a friend" is now its own view**, opened from a dedicated button in the
  panel header (person-add icon), instead of a section at the bottom of the home
  view.
- **Clicking your active account in the accounts view opens your profile.** It
  used to do nothing (switching to the already-active account returned early).
- **Removed the profile button from the panel header.** Your profile is still one
  click away: the "me" card opens the accounts view and clicking your account
  there opens the profile.
- **The composer's emoji and "+" buttons now sit together and centred with the
  input line**, with a smaller hover and a separator on the right of the "+",
  instead of being spread apart and sitting low.
- **The composer's send button is gone.** Messages go out with **Enter** (and
  `Shift+Enter` inserts a line break) — that was already the way the input is
  used, so the accent square on the right was a second control for the same
  action and only took width away from the text field. Emoji and image
  attachments are untouched; the validation that used to disable the button is
  the same one that `submit` applies on its own.
- **A verified account now shows the check — yours included.** The social RPCs
  did not return `verified` at all, so the badge could never be drawn:
  `list_friends`, `search_users` and `list_requests` now include it (migration
  `0029`), and the account read adds it too. The mark shows next to the name in
  the friends list, friend requests, search results, the chat header, the message
  header, the profile card, your own profile and the account switcher.

### Extension store
- **The extensions panel is now a store** (metadata only — we do not host the
  `.sef`). You paste the link to your **GitHub** or **GitLab** repo and the app
  finds the `.sef` asset in the **latest release** and installs it from there.
- Browse with **full-text search** and categories coming from the data (no
  hardcoded list), cards with **verified** badges, and a detail view with icon,
  screenshots, a **YouTube/Vimeo preview**, the repo link, the latest version,
  **ratings** (one per user) and a report button.
- **Publish from your account** (the same account as the social panel): name,
  summary, description, repo + asset name, categories, license, video link, an
  icon and up to **3 screenshots** (images are uploaded).
- **Auto-update + cache**: a refresh job resolves each of your extensions'
  latest release into the cache, and store-installed extensions carry a
  `.market.json` sidecar so a newer release is detected and installed on the
  next boot.
- **Verification** for accounts and extensions (checkmark). A minimal local
  admin app (`tools/admin/`, Python + Tkinter) searches accounts (name + image)
  and extensions and toggles `verified` (and the status).
- **Fixed the store coming up empty.** `market.search` was *declared* as
  returning a `MarketResult` wrapper, but the IPC returns the **plain array** —
  like `categories` / `mine` / `get`; only writes return a result. The mismatch
  failed the type check and, "fixed" on the wrong side, made the panel throw on
  every load and show *"No hay extensiones."*. The type now matches the
  implementation, and a failing search RPC is logged instead of looking like an
  empty store.
- **"Submit for review" now says what it did.** The publish form closed in
  silence, so a saved extension looked like it had vanished: publishing leaves it
  **in review** (`pending`) and it only enters the store once it is approved. The
  form now keeps that notice on screen instead of closing.
- **Installing from the store now actually loads the extension.** The store wrote
  the package to disk but never **registered** it in the runtime (the "Install
  .sef" flow in Settings did), so an installed extension showed no contributions
  at all — a theme extension installed but no new themes appeared until the app
  was restarted. A store install now registers it live and leaves it enabled.
- **The detail's button tells the truth.** It decided *Install* vs *Update* from
  the installed list, which was only loaded when you opened the **Installed** tab
  — so after uninstalling from elsewhere (Settings) it still said **Update**, and
  because "up to date" compared the *server's* cached release with the *server's*
  latest version (always equal), the button was **disabled**. The list is now
  loaded on the store tab too and the match is by **id** (not name), with
  "up to date" comparing the **installed** version. An uninstalled extension
  offers **Install** again.
- **Extension cards no longer draw an accent outline on hover.** The hover is now
  the same subtle background the rest of the app uses (Explorer, Social), and it
  applies to the cards of all three tabs — store, installed and mine.
- **Category chips follow the same rule**: no outline at all — neither on hover
  nor on the active chip (selection is marked with the accent tint + text) — and
  a small radius (`6px`) so they read as rounded squares rather than full pills.
- **The verified mark is now a proper badge**: a filled seal — circular with
  points around it — with the **check cut out** so the surface shows through,
  instead of the generic shield. It ships as a product icon (`verified-badge`),
  so a theme can override it, and it is used on the store card, the detail and
  the "mine" row.
- **The store's search field and its separator no longer look brighter than the
  rest of the IDE.** Both used the full `--color-border` while the panel chrome
  (slots, headers, resize handles) uses the softer 35% mix, so the line under the
  search stood out. They now use the same chrome border, and the field's focus is
  marked with `--color-border-strong` (the input convention used elsewhere)
  instead of the accent.

### Extension authoring (SEF CLI)
- **A panel that imports the documented hooks could not be built.** `sef build`
  only marked `react`/`react-dom` as external, so `import { usePanelTitle } from
  '@features/layout'` — straight from the panels guide — failed with
  `Could not resolve "@features/layout"`. The IDE-lent modules are now the
  external list, so the bundle imports them (and never carries a second copy of
  React, which would break hooks and context).
- **The `.sef` no longer carries the source of modules it already compiles.** An
  activity-bar icon is a module under `icons/` (as the guide shows), and packing
  copied that folder as *data*, so the raw `.tsx` travelled next to the compiled
  bundle. The packer now skips files that the manifest references: what travels
  is `dist/modules.js` plus the real data (`themes/`, `icons/*.json`, …).
- **The SEF tooling moved to its own repo**, `Scrakk-Team/sef-builder`, and is
  published to npm as `@scrakk-official/cli` (binary `sef`). `create` / `build` /
  `pack` / `validate` are the same commands, now installable by any author with
  `npm install -g @scrakk-official/cli` — or straight from its GitHub Release
  with `npm install -g https://github.com/Scrakk-Team/sef-builder/releases/latest/download/cli.tgz`,
  no registry needed. The CLI keeps its own release channel, so Scrakk Studio's
  releases and auto-update are untouched. In exchange the repo no longer ships
  the `npm run sef:*` scripts.

### Settings (UI)
- **The tools list is now horizontal and grouped by collapsible category.**
  Settings → Tools used to be a single vertical column of full-width rows, one
  per tool, under a flat category label — with dozens of tools (and the ones
  extensions add) it was a wall of rows you had to scroll to find anything.
  Each **category** (the tool catalogs' *family*) is now a header you can fold
  (`aria-expanded`, same chevron as the settings nav) with a counter, and the
  tools inside sit in cards that flow **horizontally** — a grid that adapts to
  the panel width, so two or three fit per row. The per-type group toggle (enable
  the whole group at once) stays, and so does the "Uncategorized" bucket for
  tools whose type is not in the catalog.
- **The "Performance" section is hidden from the settings navigation.** The
  section and its code are still there — it still resolves by id and its
  component is untouched — it is simply not listed in the nav.
- **The Permissions section was rebuilt so it can be read.** The rule builder was
  a scatter of unlabelled dropdowns, a mode-chip row that sat **above** the
  builder, and two identical-looking selects — and allow/ask/deny had no colour.
  It is now card-based and top-down: a labelled card for **where** the rules live
  (a Project/User segmented control) and the initial mode; the rules list with a
  coloured bar and a coloured allow/ask/deny pill per rule; and a dedicated card
  to add one, **in order** — action (a coloured three-way control), the rule with
  an "insert template" dropdown, and the modes it applies to. "Save and apply" is
  the single primary action at the bottom. The action labels also moved out of
  hardcoded Spanish into i18n.

### AI tools
- **Editing a file no longer mangles backslash escapes.** The tool pipeline ran a
  second "repair" pass over `content`, `old_str`, `new_str`, `command` and `query`
  **after** `JSON.parse`, turning literal `\n`/`\t`/`\r` into real characters and
  decoding HTML entities — so writing Python (`print("a\nb")`), a regex or a
  Windows path produced extra lines, split strings and broken code. The first
  parse already yields the exact characters the model sent; the pass now only
  normalises path arguments (and decodes a double-encoded payload if a gateway
  sends one).
- **`grep_search` is exact by default.** The query went straight to a regex
  engine, so `chr(10)` matched `chr10` and a lone `\` failed silently — and the
  sidecar/native backends treated it as a regex while the TypeScript fallback used
  `includes`, so the result depended on which backend was built. There is now a
  `regex` flag — **off by default** (literal text) — the regex backends get the
  escaped pattern in literal mode, and an invalid regex returns a clear error
  instead of an empty list.
- **`replace_in_file` no longer rewrites the whole file.** When the exact match
  missed it fell back to a normalised copy and wrote **that copy** back, silently
  stripping trailing whitespace and CRLF across the whole file; it now replaces
  only the matched span (and `$1`/`$&` in the replacement stay literal).
  `read_file` also stopped stripping trailing whitespace (in Markdown two trailing
  spaces are a hard break).

### Language servers (LSP)
- **Installing a server now really installs its language prerequisites.** The
  Install button only ran the server's own recipe, so **Go** failed when the Go
  toolchain was not on the machine (`go install gopls@latest` needs `go`). Each
  server can now declare its language **requirements** (gopls → the Go
  toolchain) and, when one is missing, it is listed **under the server** with its
  own **Install** button. Installing it downloads the latest official toolchain
  from the internet — for Go, the current stable tarball from `go.dev/dl` (the
  URL is picked from the JSON manifest by OS/arch) is fetched and extracted into
  `~/.scrakk/toolchains/go`, its `bin` joins the augmented `PATH`, and then
  `gopls@latest` is installed with that `go`. The server's own Install button
  does the same in one step (requirements first, then the server). No `sudo` and
  no system package manager: the toolchain lives in the app's folder.
- **More servers ship a real recipe**, so their Install button works instead of
  failing with "no install recipe": **Rust** (the official `rust-analyzer`
  release, a `.gz` single binary), **Lua** (`lua-language-server`, a full tree
  extracted into `~/.scrakk/lsp/…`), **Svelte** (`svelte-language-server` from
  npm) and **Terraform** (`terraform-ls`, whose latest version and file are read
  from the official HashiCorp release index by OS/arch).
- **Dart** declares the **Dart SDK** as its prerequisite: installing it fetches
  the current stable SDK from `storage.googleapis.com/dart-archive` into
  `~/.scrakk/toolchains/dart` (the Dart language server *is* `dart
  language-server`, so there is no separate server binary). **Java** and
  **Elixir** show their runtime requirement (Java 21+ / Elixir + Erlang) so it is
  clear what is missing.
- **The prerequisite row under a server no longer renders as a box** pinned to
  one side: it is a full-width line with no border and the same background as the
  rest of the row. And when a server has **no** recipe, its **Install** button is
  **not** shown at all (instead of showing it and failing with "no install
  recipe" once clicked).
- **A server that is not installed no longer offers "Turn off".** The row showed
  the on/off toggle for every server — including the ones with no binary, which
  are not running — so "Turn off" appeared even for servers the user never
  installed. The toggle now only shows when there is something to turn off (the
  server is installed) or when the user had already turned it off (then it
  offers "Turn on").
- **Terraform's server now starts.** The recipe installed `terraform-ls` but ran
  it with no arguments; `terraform-ls` requires the `serve` subcommand and, with
  none, it printed its help and exited — which surfaced as "unknown error"
  followed by "server not configured" on restart. The server definition now
  passes `serve`.
- **A crashed server no longer reports "unknown error".** When the process died
  without writing to stderr (just as terraform-ls did: it writes to stdout), the
  failure detail was empty. It now falls back to the exit code, so the
  notification always says something real.
- **Installing an npm server no longer fails on peer-dependency conflicts.**
  All npm servers share one managed directory, so a peer dependency could not be
  satisfied at once — `svelte-language-server` wants `typescript ^5.9.2 ||
  ^6.0.2` while `typescript-language-server` pulls `7`, and npm aborted the whole
  install with ERESOLVE. The managed install now uses `--legacy-peer-deps` (plus
  `--no-audit --no-fund`).
- **Installed servers are recognised after a restart.** The directories the app
  installs into (`~/.scrakk/lsp/bin` and the managed npm `.bin`) now join the
  augmented `PATH`, so a server installed from the app reads as *installed* the
  next time instead of offering **Install** again.
- **Installing a server on Windows no longer fails with `spawn EINVAL`.** Since
  Node 18.20/20.12 a `.cmd`/`.bat` file cannot be spawned without `shell: true`
  (the Windows command-injection fix) and `npm` resolves to `npm.cmd`, so every
  npm server (html, json, pyright, bash, yaml, vue, svelte…) failed to install;
  the LSP client had the same bug, so an installed server — itself a `.cmd` shim —
  would not start either. A `spawnInvocation` helper now routes Windows
  `.cmd`/`.bat` through the shell with its arguments quoted (a `…/Scrakk
  Studio/lsp/npm` prefix with spaces would otherwise break the command line), and
  spawns everything else directly.

### Development
- **A Windows test build lands on Gofile without cutting a release.** A workflow
  compiles the NSIS `.exe` and uploads it to Gofile, printing the download link in
  the run summary — no tag, no GitHub Release and no Supabase row, so it never
  reaches the updater. Handy for trying a change on a Windows machine without
  shipping it.

### Community contributions
Fixes merged from outside the core team. Each entry names the pull request, what
it fixes, and who reported it.

- **The extension path jail could be escaped with `..` path segments**
  ([#17](https://github.com/Scrakk-Team/Scrakk-Studio/pull/17), reported and
  fixed by [@CodeIbrah](https://github.com/CodeIbrah)). `checkPathAccess`
  compared the **raw** requested path against the workspace roots with
  `startsWith`, and `<workspace>/../../etc/passwd` still begins with the
  workspace root — so any extension with `fs.read`/`fs.write` could read,
  overwrite or recursively **delete** any file the user account can reach, and
  the blocked sensitive paths were reachable the same way. Both sides of the
  containment check are now **normalised** (`.`, `..` and separators resolved)
  before the comparison — and before the sensitive-path check — `ext:fs-read`
  validates the resolved path (as `ext:fs-write` already did), and the extension
  id is validated before it is used to build a path.
- **The session flush was discarded on quit**
  ([#19](https://github.com/Scrakk-Team/Scrakk-Studio/pull/19), reported and
  fixed by [@CodeIbrah](https://github.com/CodeIbrah)). `before-quit` ran
  `flushAllTokens()` fire-and-forget, and Electron does not await it — a token
  refresh that landed just before closing was lost and the user had to sign in
  again. Shutdown is now sequenced: the first `before-quit` is `preventDefault`ed,
  the flush, the extension-host shutdown and the search servers are awaited (each
  with a 3s cap) and the quit resumes when they settle, even if one fails.
- **CI ignored the lockfile and never ran the suite on Windows**
  ([#21](https://github.com/Scrakk-Team/Scrakk-Studio/pull/21), reported and
  fixed by [@CodeIbrah](https://github.com/CodeIbrah)). The install jobs used
  `npm install`, which resolves caret ranges against the registry — a Vite minor
  broke the build with no repo change — so they now use `npm ci` and fail if a
  step rewrites `package-lock.json`. A `windows` job now runs the typecheck and
  the full suite, and the release job runs the suite too (it used to skip it).
  Two real bugs surfaced while making the suite pass on win32:
  `new URL(...).pathname` built a broken path on Windows (now `fileURLToPath`),
  and a `#!/usr/bin/env node` shebang in an ESM module broke the collection of
  two suites under Vite's SSR transform.
