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
  layout cache booted with its placeholder values (18px row, 9px column) while
  the font atlas already knew the real ones (23px row for the 15px editor
  font). Every line was therefore 5px too tight — the text overlapped, and
  everything that is centred on the row (the caret, the fold chevron, the
  gutter icons, the minimap) sat 2.5px off. The only thing that "fixed" it was
  pressing `Ctrl+` and then `Ctrl-`, because *that* is the path that recalculated
  the metrics. Now the metrics always follow the font: the editor is correct
  from the very first frame, and a metrics change also invalidates the cached
  text layouts (their key did not include the metrics, so they kept the old
  positions).
- **Room for three-digit line numbers.** The gutter reserved the icon column
  (bookmark + fold chevron) out of the space meant for the digits, so a
  three-digit number overflowed its box and ended up touching — or clipped by —
  the left edge of the window. The gutter now reserves the digits properly and
  keeps a 10px margin from the edge, for any number of digits.

### Development
- New engine test target (`InnertaMetricsTests`): the cell metrics must follow
  the font atlas, and the gutter must leave room for the line numbers.
