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

### App icon (Windows)
- **The packaged app now shows the Scrakk icon instead of Electron's.** The
  window icon points at `assets/scrakk-studio-b.png`, but `assets/` was excluded
  from the bundle, so in a packaged build that path did not exist and the window
  had no icon — Windows fell back to the default Electron one. The asset is now
  copied to `resources/`.

### Status bar (UI)
- **The command trigger no longer overlaps the other chips.** It was absolutely
  centred with a fixed `min-width: 220px`, so on a narrow window it ran into the
  chips on the left (encoding, cursor position) and on the right. It now measures
  the real gap between both groups and uses the whole gap — if there is room to
  the right it does not shrink — and once the width hits the cap it slides left
  until it sits next to the left chips. Past that it becomes an icon-only button
  like the bell/settings, and it is not painted when there is no room at all.

### Extensions
- **Removed the builtin Clock extension** (`panels/clock`). It shipped in every
  build and contributed a side panel, an activity-bar button and a "Dashboard"
  center tab; now it is gone from all builds.

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
- **Fixed the store search result being consumed raw.** `market.search` returns
  a result wrapper (`{ ok, data }`), but the panel fed it straight into the list
  state, so the search response was never unwrapped; it now reads `data` and
  surfaces the error when the call fails.

### Extension authoring (SEF CLI)
- **The SEF tooling moved to its own repo**, `Scrakk-Team/sef-builder`, and is
  published to npm as `@scrakk-official/cli` (binary `sef`). `create` / `build` /
  `pack` / `validate` are the same commands, now installable by any author with
  `npm install -g @scrakk-official/cli`. The CLI keeps its own release channel
  (npm plus its GitHub Release, with a registry-free `cli.tgz` + `install.sh`
  fallback), so Scrakk Studio's releases and auto-update are untouched. In
  exchange the repo no longer ships the `npm run sef:*` scripts.
