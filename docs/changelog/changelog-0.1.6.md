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
