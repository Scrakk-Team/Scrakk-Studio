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
- **Clicks, hover and the wheel now work inside TUIs on Windows.** They did
  nothing in a full-screen app (Claude Code, htop, vim…) while the very same app
  worked on Linux. The engine and the host were correct — the **transport** was
  not: node-pty used the **OS ConPTY**, and that ConPTY does not carry xterm mouse
  reporting (neither the app's `?1000/?1002/?1003/?1006` request nor the mouse
  input), so libvterm never entered mouse mode and every event was gated off. The
  spawn now asks node-pty for the **ConPTY it already ships** (Windows Terminal's
  `conpty.dll`) on Windows, which does carry it. Nothing in the cell/grid math
  changed.

### Terminal (tabs)
- **The terminal tab shows the title the shell reports** (OSC 0/2 — what the
  `bash`/`zsh` prompts and TUIs like `vim`/`lazygit` set), instead of a fixed
  "Terminal". The host already receives the raw PTY bytes, so an incremental
  parser reads the sequence in the terminal session (a sequence split across
  chunks is handled) and the tab publishes it as its label. It falls back to
  "Terminal" while nothing has reported one.

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
- **A repository can now host several extensions, each with its own version.**
  The store resolved `owner/repo` → *the latest release* → the `.sef`; with a
  catalogue repository (one folder per extension, one release per extension
  tagged `<id>@<version>`) "the latest release" is whoever published last, so a
  second extension would have installed the first one's package. Now, when a row
  pins an asset (`asset_name`) the resolver picks **the newest release that
  contains that asset**, and the version comes from the tag suffix
  (`halloween-themes@1.3.0` → `1.3.0`). Repositories that publish a single
  extension keep working exactly as before.
- **Exotic Themes is now Halloween Themes** (`exotic-themes` →
  `halloween-themes`, v1.3.0): the same 12 themes, renamed in the store (name,
  slug, asset) so the package, the repository and the catalogue folder match.
  Scrakk's own installable extensions now live in one place, the
  [`Scrakk-Team/extensions`](https://github.com/Scrakk-Team/extensions)
  repository — documented in [Official
  extensions](../extensions/guides/official-extensions.md).
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

### Events (SEF)
- **Extensions can now ship *events*: temporary experiences with their own
  activation window.** A new `events` contribution kind (the 15th) lets a `.sef`
  declare `contributes.events: [{ id, name, path }]` and point at a **scene**: a
  window, an activation mode, optional resources and a timeline of operations.
  The engine knows **operations, not creatures** — an effect is an SVG path the
  pack ships (drawn as a `Path2D`), sounds are ZzFX parameter arrays (no audio
  files), and strings come from the pack. There is a test for that: if the pack
  is deleted, the IDE does not mention it anywhere.
- **The window is a *range*, not a date.** `{ "from": "2026-10-20", "until":
  "2026-10-31" }` is active from Oct 20 to Oct 31 **inclusive** and then turns
  itself off — even if the app stays open. A bare `YYYY-MM-DD` is parsed as a
  **local** day on purpose (`new Date('2026-10-20')` is UTC and would shift the
  window a day depending on the timezone) and `until` covers the whole day. No
  window means no automatic activation: only the palette command.
- **Activation has three ways and one rule.** `auto` starts it, `notify` offers
  it (with an "Activate" action), `manual` never starts it on its own; `once`
  (default true) stops a lived event from coming back and `priority` breaks ties.
  Only **one event runs at a time**, and the palette command **ignores the
  window** — it is how you try a Halloween event in July.
- **Nothing gets stuck.** Overrides (today: force a theme) are **in memory** and
  restored on exit, so a crash or a quit mid-event cannot leave a sticky theme;
  the palette command `events.stop` cuts it early. A long window cannot fire the
  auto-stop early either: a timeout past the ~24.8-day `setTimeout` limit is
  chunked instead of being clamped to 1 ms.
- **A testing mode that does not burn the real event.** The `testing-events`
  flag plus a **fake clock** (`advance 1 day`, `advance 7 days`, `use the real
  one`) let you walk into the window without touching the OS clock — and with the
  clock set, the *automatic* path behaves exactly like production. Testing writes
  to a **separate state namespace**, so a test run never consumes the real `once`.
- **A Halloween pack can now have its own night.** With the pack's manifest
  updated, "Halloween Night" (window Oct 20 → Oct 31) is authored entirely as
  data: bats flying in from both sides, fog tinted with the theme's accent, a
  thunder clap, a vignette and a status chip — plus the pack's own theme forced
  while it lasts.
- **Performance and accessibility are part of the contract.** Effects render on a
  single canvas with a hard particle cap and one animation frame loop, they honour
  the IDE's low-end mode and `prefers-reduced-motion` (particles and shake are
  skipped; static fog/tint/vignette still apply), and the overlay is
  `pointer-events: none` and adds zero layout. The editor/terminal grid is never
  touched.
- Docs: a new [events guide](../extensions/guides/events.md) and the contributes
  table updated to 15 kinds. The `sef` CLI was updated in the same pass (`events`
  is a known kind and the packer now carries `events/` into the `.sef`), so
  `sef validate` / `sef pack` accept an event pack.

- **A flying shape is BODY + WING, and only the wing moves.** `draw.path` is the
  body and `draw.wing` is **one** wing: the engine mirrors it for the other side
  and rotates the pair around `draw.wingAnchor` (the shoulder), between ±22°.
  The body is drawn untouched, so a silhouette flaps instead of wobbling whole —
  the first attempt reused a single rigid path and animated the *entire* shape,
  which read as a butterfly and, worse, moved the body too. (A shape is also
  centered on its particle now instead of being drawn from its top-left corner,
  so the `viewBox` is a coordinate system and not an offset.)
- **Flight stopped being a straight line.** `motion.through` bows the path (and
  with no `through` the engine auto-bows every particle a little, at random: a
  perfect line reads as mechanical), `motion.bob`/`bobHz` add the vertical wander
  of flight, `spread` fans a group's **arrival** points out so it opens instead
  of stacking, and `bank` tilts each one toward where it is going. `jitter` still
  scatters where each one *appears*, and `every` is what decides flock (small)
  versus river (big).
- **`tools/_look-path.mjs`: a shape has to be LOOKED at.** A new dev tool prints
  an SVG path as filled ASCII, and with `--wing` / `--wing-angle` / `--pivot` it
  renders the body with the mirrored wing at a given flap angle — the same idea
  as `_look-png.mjs`. Judging a silhouette from coordinate numbers is exactly how
  the first bat shipped looking like a moth. The pack's bat was tuned with it:
  pointed ears, three scalloped notches per wing, and a shoulder that keeps the
  body still in every frame.

- **Events can use REAL audio — the chiptune synth was the wrong default.** A
  sound in a scene is now either a **`file`** (a path inside the package, like
  `assets/tormenta.ogg`: the runtime resolves it with its real mime, keeps the
  path jailed to the package, decodes it when the event activates and **preloads
  every sound of the scene**, so a clap scheduled at 2.6 s is already decoded) or
  `zzfx` — which is an **8-bit chiptune** synthesizer: fine for a retro pack,
  plainly wrong for ambience, because a storm built out of it sounds like a
  video game. The mixer caches decoded buffers, so a looping ambience decodes
  once. `sounds` keeps `gain`/`loop` for both forms.
- **Credit travels with the pack.** The Halloween pack's new soundtrack (a storm
  bed, a thunderclap, a wolf howl and a raven call) comes from Wikimedia Commons
  — one file under CC BY 4.0 and three public domain — so the pack ships a
  `CREDITS.md`, and the packer now **copies `CREDITS.md` / `LICENSE*` into the
  `.sef`**. Shipping a CC BY asset without the attribution next to it is a
  licence violation, not a nicety.
- **The CLI learned both things.** `sef pack` carries the pack's `assets/`
  folder into the `.sef` (without it the event plays silence) and `sef validate`
  reports a sound whose `file` does not exist.
- **`data:` audio was silently blocked by the CSP.** A `file` sound was loaded by
  `fetch()`-ing its `data:` URL, and the renderer's CSP (`connect-src` falls back
  to `default-src 'self'`; `data:` is allowed for images and fonts, not for
  network calls) rejected it — so a `file` sound played **nothing**, with no
  error at all. It now decodes the base64 **in memory** (`atob` →
  `decodeAudioData`), which is also cheaper than a round trip. `dataUriToBytes()`
  has its own unit test.
- **Scenes reload without restarting the app.** The registry keeps the scene it
  normalized at **boot**, so editing a pack's JSON changed nothing until an app
  restart — which reads exactly like "my change was not applied". A new palette
  command, **"Recargar eventos desde el pack"**, re-reads every event scene from
  disk; a broken JSON leaves the previous scene in place instead of wiping it.

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

### Themes (Appearance)
- **The corner radius now animates when you switch themes.** The radii are
  registered custom properties (`@property --radius-*` with
  `syntax: '<length>'`), which makes them animatable, and `:root` transitions
  them — so changing theme interpolates the corners live across the whole chrome
  instead of snapping. The transition is armed only **after the first paint**, so
  the theme you open with does not morph on startup; only later switches animate.
- **Zed One Dark now sets its own corner radii.** Like OpenCode AI, the theme
  declares the `radius` variable the theme engine reads (`'rect'` for fully
  square, `'round'` for the system values, or a per-slot map). Zed One Dark uses
  a map: nearly square but with a little rounding — `panel`/`md` **4px**,
  `input`/`sm` **3px**, `xs` **2px** (the `capsule` shape stays, since it is a
  shape — avatars, dots — not a corner).

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
- **Settings → About now has an "Uninstall" button that really uninstalls.** It
  asks for confirmation (with what will and won't be removed) and then removes the
  app using each platform's own mechanism, instead of a fake button:
  - **Windows**: it reads the uninstaller registered by the NSIS installer
    (`QuietUninstallString` in the registry) and runs it silently.
  - **Linux**: an **AppImage** deletes the `.AppImage` file and its menu entries;
    a **deb** is removed with `dpkg -r` through `pkexec` (if you cancel the
    polkit prompt the app stays open and tells you the manual command);
    a **tar.gz / portable** build removes its own folder (only when it looks like
    the app folder).
  - Development builds and unsupported formats say so instead of pretending.
  Your settings and user data (`~/.scrakk`, the config folder) are **not**
  touched.

### Chat (streaming)
- **Many tool calls no longer re-render all of them.** Every tool result rebuilt
  the `tool_results` map, and that re-rendered **every** card in the message (each
  re-parses its args, re-renders its visual and re-emits its `<style>`). Each row
  is memoized now, so only the card whose result changed re-renders — the one that
  was making a turn with many tool calls feel laggy.
- **Long tool arguments no longer break the row.** A tool call's summary card
  ("Ran $ …", "Edited …", "Read …") is a single line: a very long command or path
  now truncates with "…" instead of overflowing the row. The full preview is still
  in the result modal, which is untouched.
- **The chat no longer lags while the model is generating.** The conversation was
  persisted with `requestIdleCallback`, which fires as soon as the thread is idle:
  during a stream (a state change per frame) it serialised the **entire history**
  to `localStorage` roughly **once per frame** — O(n) per frame, O(n²) per
  generation, plus constant re-allocation. That was the jank, and it only showed
  while the model streamed. It is now a real trailing debounce (the write lands
  ~400 ms after the stream stops; `beforeunload` still flushes). The composer
  chrome (spark, glow, footer) is memoized so a content delta no longer re-renders
  it, and the DEV layout probe stopped measuring every message on every frame.
- **Markdown renders live.** While a message streamed it was drawn as plain text
  and only parsed once the round ended. It is now markdown **as it streams**, with
  the content throttled (~150 ms) so react-markdown + Prism do not re-parse the
  whole message on every frame.
- **Moving the chat panel no longer loses the "Stop".** "Is this session
  generating" lived in a `useState` of the panel, and moving/changing the panel
  remounts it: the button flipped back to **Send**, which let you send a second
  message while the model was still writing — with the first stream orphaned and
  impossible to stop. The run state now lives in a per-**session** registry outside
  the component (controller + promise), so it survives a remount: the button stays
  on Stop, sending stays blocked, and Stop still aborts.
- **A very long message no longer stretches the chat.** A user message that was a
  pasted log or file pushed the conversation a screen down. The bubble is now
  clamped to six lines (with the "…") and a caret button **inside** the bubble
  expands it — and collapses it back. The button only appears when the text
  actually overflows: the clamp is **measured**, not guessed from a character
  count, so short messages keep the bubble exactly as before.

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
- **Internal planning docs live in `plans/` (gitignored).** Design notes for
  features that are not shipped yet — including the mechanics of upcoming easter
  eggs — are kept out of the public tree on purpose.
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

### Security (audit)
Hardening from a full security pass over the desktop app, the extension system
and the backend. Each item names the exposed surface and what changed; anything
that needs an out-of-repo action (key rotation) is called out explicitly.

- **The local admin bundle can no longer reach the public repo.**
  `tools/admin.zip` (an archive of the `service_role`-using admin tool) was not
  matched by `.gitignore` — only the `tools/admin/` directory was — so a plain
  `git add -A` would have published a production `service_role` key. The ignore
  rule is now `tools/admin*` (directory **and** archives), and `*.zip`, `*.7z`,
  `*.tar.gz`, `*.bak` and `*.orig` are ignored as well because local backups can
  carry `.env` files. `.env` was also `0664`; it is now `0600`. **Out-of-repo
  action still required:** rotate the Supabase `service_role` JWT, the R2 access
  key/secret and the DeepL key — they lived in that archive and in `.env`.
- **Git refs can no longer smuggle command-line options.** `git:log`,
  `git:diff-numstat`, `git:checkout` and `git:branch-create` passed the `ref`
  (and `startPoint`) straight to git without validating it, unlike the rest of
  the handlers. A repository can commit a branch literally named
  `--output=/home/<user>/.bashrc`; the Git panel uses the current branch as the
  default `ref`, so mounting it ran `git log --output=…` and **overwrote an
  arbitrary file** — the log body is attacker-controlled, so the next shell
  executed it. Refs are now validated by `shared/git-ref.ts` (SHA, `HEAD` or a
  safe ref; never a leading `-`), `log`/`diff` also pass `--end-of-options`,
  branch start points are validated and stash indices must be non-negative
  integers. Covered by `tests/git-ref.test.ts`.
- **Opening the IDE from a hostile folder can no longer execute native code.**
  The search addon (`.node`, loaded with `require`) and the `kolargrep` sidecar
  (`spawn`) both had `process.cwd()/native/...` in their candidate lists. A repo
  that ships `native/search/index.linux-x64-gnu.node` or
  `native/kolargrep/target/release/kolargrep` was therefore executed with the
  privileges of the main process just because the app was started from that
  directory (`cd repo && scrakk .`). Candidates now come only from the app's own
  install/checkout (`shared`-free helper `search/nativePaths.ts`), and
  `tests/native-paths.test.ts` pins that `cwd` never leaks in.
- **A project's `.scrakk/lsp.json` now requires Workspace Trust before it can
  run a command.** The config is layered `user → project`, and the project
  layer accepted any `command`, `args` and `env` (`LD_PRELOAD` included) that
  was spawned automatically when a matching file was opened — cloning a repo
  and touching a `.ts` was remote code execution, with the IDE's environment
  (`R2`, GitHub, Supabase secrets) inherited. The first project-defined server
  now shows a native consent dialog with the exact command; the decision is
  stored in `userData/workspace-trust.json` (never inside the repo) and a
  denial is remembered so it does not nag. `kind: "custom"` install recipes are
  also ignored for non-builtin servers. Covered by
  `tests/workspace-trust.test.ts`; CI mounts trusted workspaces through
  `SCRAKK_TRUST_PROJECT_LSP=1`.
- **LSP auto-installation is no longer a zip-slip or a memory bomb.**
  `extractTree`/`extractBinary` joined archive entry names straight onto the
  destination (`path.join(dest, name)`), so a malicious release ZIP could write
  `../../.config/autostart/x.desktop`; `tar` trees were extracted without
  inspecting their entries, and `downloadTo` buffered the whole body in RAM with
  no cap. Entries now go through `safeArchivePath()` (rejects `..`, absolute
  paths, Windows drive letters/UNC and NUL), tar trees are listed before
  extraction, downloads stream to disk with a 512 MB cap and require HTTPS, and
  gzip/ZIP expansion is bounded (1 GB / 20k entries). Covered by
  `tests/lsp/install.test.ts`.
- **The `.scrakk` and extension filesystem jails now resolve symlinks.** Both
  validated the path lexically (`path.resolve` + `startsWith`), which does not
  see links. A repository can commit `.scrakk/data -> ~/.ssh` (git preserves
  symlinks) and then `data/id_rsa` passes the old check, so `scrakk:read` leaked
  the key and `scrakk:write` could add `authorized_keys`; the extension jail had
  the same hole for `ext:fs-*` and `workspace.fs`. Paths are now checked against
  the `realpath` of the target and of every allowed root, including the nearest
  existing ancestor for files that do not exist yet
  (`extensions/realpathJail.ts`). Covered by `tests/symlink-jail.test.ts` and
  `tests/extension-symlink-jail.test.ts`.
- **`web_fetch` no longer reaches loopback services or metadata endpoints, and
  no longer buffers unbounded responses.** Loopback (`127/8`, `::1`) was
  explicitly allowed "for dev", so a public URL that redirected to
  `https://127.0.0.1:<port>` could talk to Docker/kube/panel APIs and the error
  message even returned 300 bytes of the body. `::ffff:7f00:1` (mapped IPv4 in
  hex) also slipped past the block list. Loopback is now denied unless
  `SCRAKK_ALLOW_LOOPBACK_FETCH=1` is set, IPv6 is expanded before checking
  (hex-mapped v4, link-local, unique-local), and the body is read through a
  2 MB stream limit instead of `arrayBuffer()` — a gzip bomb could exhaust the
  main process during the 25 s timeout. Invalid HTML entities such as
  `&#99999999;` no longer throw `RangeError` and abort the fetch. Covered by
  `tests/web-ssrf.test.ts`. Residual risk: DNS rebinding (the resolver and
  `fetch` are separate lookups) is not eliminated.
- **`terminal:cd` and `screenshot:capture` sanitize the renderer-provided
  path/name.** On Windows, `changeDirCommand` escaped `"` as `""`, which does
  not escape anything in `cmd.exe` — it closes and reopens the quote, and `&`
  outside quotes separates commands, so a workspace folder named
  `x" & calc.exe & rem "` executed code when the terminal relocated. Windows
  paths containing `" & | < > ^ %`, NUL/CR/LF are now rejected. The screenshot
  name is reduced to a basename and normalized (`sanitizeScreenshotName`), so
  `name: "../../.config/autostart/x"` can no longer write (and `mkdir -p`)
  outside the chosen directory. Covered by `tests/shell-cd.test.ts`.
- **Provider API keys are no longer stored in the renderer.** They lived in
  `localStorage['scrakk-studio:providers']`, i.e. in the Chromium profile in
  plain text (and readable by any XSS or extension bundle in the renderer). The
  keys now live in the **main process** (`userData/secrets/api-keys.json`,
  `safeStorage`-encrypted when the OS keychain is available, `0600` otherwise);
  the renderer only receives booleans (`llm:api-key-status`) and the existing
  keys are migrated on first launch and removed from `localStorage`. The stream
  request no longer needs `apiKey`: the main resolves it from `providerId`.
- **The LLM endpoint is validated and the response is bounded.** `baseUrl`
  came straight from the remote models.dev catalog (and from the renderer):
  a compromised catalog/cache could point a provider at an attacker host and
  receive the stored `Authorization: Bearer`. The main now requires `https:`
  (plain HTTP only for loopback/local models), rejects private/link-local/
  metadata addresses, refuses redirects (`redirect: 'error'`) and aborts a
  stream above 8 MB of accumulated text. Covered by `tests/llm-api-keys.test.ts`.
- **Extension SVG icons are sanitized before they are injected as HTML.** The
  `iconSvg` of a `views` contribution (copied verbatim from a VSIX by the
  translator) and any SVG resolved for an `activityBar` button reached
  `dangerouslySetInnerHTML` in the ActivityBar/ToolDock. An SVG is HTML, so
  `<svg onload=…>`, `<script>`, `<foreignObject>` or `href="javascript:…"` ran
  in the IDE origin — with `window.api` — **without needing a bundle**. Icons
  now go through `sanitizeSvgIcon` (blocks script/style/foreignObject/iframe/
  object/embed/link/meta/use/image/animate, strips `on*`, `style` and external
  `href`/`src`, rejects external `url()`), applied both when parsing the
  contribution and at the three injection points. Covered by
  `tests/svg-icon.test.ts`.
- **The extension host no longer receives every open document, cannot open a
  folder, and cannot launch arbitrary schemes.** `applyDocumentEvents` sent the
  full text of every `doc/open`/`doc/change` to **all** live hosts, including
  extensions without `fs.read` and files outside their workspace
  (`~/.aws/credentials` opened by hand), and `init.documents` seeded the same
  set. Delivery is now filtered per session (`canReadDocument`: `fs.read` +
  workspace root). `command/execute` refuses `vscode.openFolder` and the file
  pickers (which could widen the host jail to `/`), and `env.openExternal`
  only allows `https:`, `http:` and `mailto:` (no `file:`/`smb:`/`ms-*`).
  Covered by `tests/permissions-jail.test.ts`.
- **A `.sef` is bounded and tied to its catalog slug.** `parseSef` had no size
  limits (a zip bomb took down the main process), accepted a manifest under
  `../`, and the store installed whatever `id` the package declared — so a
  published extension could declare another extension's id, delete its folder
  and inherit its `.market.json` (and its future auto-updates). Downloads now
  have a 100 MB cap and an allowlist of GitHub/GitLab asset hosts; extracted
  content is limited (256 MB / 20k files); `installSefFromBuffer` accepts an
  `expectedId` and verifies it **before** deleting anything. Automatic
  extension updates are now opt-in (`SCRAKK_AUTO_UPDATE_EXTENSIONS=1`) until
  packages are signed. Covered by `tests/sef-install.test.ts`.
- **Account sessions fail closed without a real keyring, and removal revokes
  the refresh token.** On Linux without keyring, `safeStorage` reports
  `basic_text` (a fixed "peanuts" key) and the account store wrote
  `access_token`/`refresh_token` as JSON anyway. It now treats `basic_text` as
  "no encryption" and refuses to persist unless
  `SCRAKK_ALLOW_PLAINTEXT_SESSION=1`; it also `chmod 0600`s an existing file
  (the `mode` option only applies on creation). Removing an account uses
  `signOut({ scope: 'global' })`, so a copied refresh token no longer survives
  the logout. Covered by `tests/account-store.test.ts`.
- **models.dev is treated as untrusted input.** A remote/cached catalog could
  contain a provider or model called `__proto__` and mutate the projection map,
  and the disk cache was returned without validating its shape. Dangerous keys
  are skipped, the reasoning map has a null prototype, the cache is validated
  (`id`, `baseUrl`, `models`) and the remote payload is capped at 20 MB.
  Covered by `tests/models-catalog.test.ts`. Git errors now also redact
  `scheme://user:password@host` credentials (GitLab/Gitea PATs), not just
  GitHub's.
### Security (backend)
- **The extension market can no longer self-publish, self-verify or swap its
  repo after approval.** `extensions_admin_guard` was `BEFORE UPDATE` only, so
  an authenticated user could `INSERT` a row with `status='published'`,
  `verified=true` and inflated counters; and after approval the owner could
  `PATCH repo_url` without triggering a new review (the installed package then
  auto-updated from the attacker's repo). The guard now covers `INSERT` and
  demotes to `pending`/unverified whenever `repo_url`, `repo_provider` or
  `asset_name` changes.
- **Storage listing is no longer anonymous.** The `public read` policies on the
  `avatars` and `chat-images` buckets also allowed `POST /storage/v1/object/list`
  with the publishable key, exposing user UUIDs and DM filenames. `SELECT` is
  now restricted to the owner's folder (the buckets stay public, so existing
  public URLs still download).
- **`accept_legal` actually persists the consent.** It was `SECURITY INVOKER`
  and `authenticated` has no `UPDATE` on the legal columns, so the acceptance
  was silently lost. It is now `SECURITY DEFINER` with `search_path=''`,
  `WHERE id = auth.uid()`, and execute is limited to `authenticated`.
- **Release rows of pending/suspended extensions are no longer public**, and
  `anon` lost `TRUNCATE` on the market tables and execute on
  `increment_extension_download` (the download counter could be inflated by
  anyone with the public key).
- **`social-file` validates the object key and the peer id.** A message body
  with an arbitrary `key` could get a signed URL or delete any object (only
  `..` was rejected); `peerId` was interpolated into a PostgREST filter; and
  insert errors were returned verbatim. Keys must match `code/<uuid>`,
  `peerId` must be a UUID, and internal errors return a generic message.
  Migration `docs/backend/0031_security_hardening.sql` applied to
  `ufcwwigmzgmyyfauymim`; `social-file` deployed (v4).
- **CSP and navigation hardening.** The renderer policy now adds
  `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` and
  `frame-ancestors 'none'` (an XSS could otherwise inject `<base>` and
  redirect relative loads). `will-navigate` now cancels **every** non-app
  navigation; before it only blocked http(s), so a `file:///…` link could
  navigate the window and load a local page in the app origin, inheriting the
  preload (`window.api`). The `scrakk-ext://` handler also rejects requests
  whose `Origin` is a different extension (cross-extension asset reads).
  Covered by `tests/csp.test.ts`.
### Security (supply chain & docs)
- **The documented `sef` install no longer points at an unclaimed npm name.**
  `npm view @scrakk-official/cli` returns 404, yet four guides told users to
  `npm install -g @scrakk-official/cli`; anyone could register that scope and
  serve a malicious CLI (the tool that builds and packages their extensions).
  The docs now use the GitHub Release tarball
  (`Scrakk-Team/sef-builder/releases/latest/download/cli.tgz`) and explicitly
  say the npm package is not published yet.
- **GitHub Actions are pinned to commit SHAs** (`checkout`, `setup-node`,
  `upload-artifact`, `download-artifact`, `softprops/action-gh-release`) and
  every workflow declares `permissions: contents: read` (the release job keeps
  `contents: write`). A moved tag or a compromised third-party action could
  otherwise publish a malicious release that feeds the updater.
- **`updates-seed.yml` no longer interpolates `github.event.inputs.tag` into a
  shell.** A tag like `v1; curl … | sh` ran in the runner; it now goes through
  an `env:` and is validated against `^v?X.Y[.Z]$`. `build-gofile.yml` installs
  with `npm ci --ignore-scripts` plus the explicit Electron install and checks
  that the lockfile did not change.
- **Secrets no longer reach child processes, and a packaged build ignores the
  working-directory `.env`.** The main loads R2/GitHub/GitLab/Supabase secrets
  into `process.env`, and the PTY, LSP servers, the extension host, `git` and
  the LSP installers inherited **all** of it — an extension or a malicious
  language server could just read `process.env.SCRAKK_R2_SECRET_KEY`. Child
  environments are now filtered (`childEnv`: no `SCRAKK_*_TOKEN/SECRET/KEY`,
  no `SERVICE_ROLE_KEY`, no `LD_PRELOAD`/`NODE_OPTIONS`/`GIT_SSH_COMMAND`).
  `loadLocalEnv()` only reads `cwd/.env` in development; in a delivered build a
  `.env` next to the executable could redirect the login API or inject
  `LD_PRELOAD`. Git hooks from a repository are disabled by default
  (`SCRAKK_ALLOW_GIT_HOOKS=1` to opt in): a `.git/hooks` shipped inside a ZIP
  executes on commit/checkout/pull. Covered by `tests/env-filter.test.ts`.
- **Encoding tools no longer read/write credential files, and packaging uses
  Electron fuses.** `encodings:read`/`encodings:write` accepted any absolute
  path (and `write` created parent directories), so a compromised renderer
  could read `~/.ssh/id_rsa` or plant `~/.aws/credentials` without the extension
  jail. Sensitive paths (`.ssh`, `.aws`, `.gcloud`, `.kube`, `.gnupg`, `*.pem`,
  `*.key`, `id_rsa`, `.netrc`) are rejected and reads are capped at 256 MB.
  `electron-builder.yml` now sets `runAsNode: false`,
  `enableNodeOptionsEnvironmentVariable: false`,
  `enableNodeCliInspectArguments: false`, `enableCookieEncryption: true` and
  `onlyLoadAppFromAsar: true`, and the update feed points at the canonical
  `Scrakk-Team/Scrakk-Studio` instead of relying on a GitHub redirect.
  Covered by `tests/encodings.test.ts`.
- **Installing an extension that runs code now asks for explicit consent.**
  The manifest `permissions` are not a real boundary (the host is Node without
  a sandbox and UI bundles run in the renderer), but a `.sef`/`.vsix`/market
  install was a single click. A native dialog now lists the declared
  permissions and warns that the extension can read files and run commands as
  the user. Declarative packages (themes, icons, languages) are unaffected.
  Covered by `tests/sef-install.test.ts`.
