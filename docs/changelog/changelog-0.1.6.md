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

## 0.1.6 — The editor's grid, from the first frame

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
