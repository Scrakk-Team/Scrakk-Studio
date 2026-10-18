---
title: "Editor screenshots (and how the editor is verified to PAINT)"
group: editor
order: 40
summary: "The `editor.captureScreenshot` command saves a PNG of the editor area. It is also how you verify that the editor paints an extension's tokens."
---
# Editor screenshots (and how the editor is verified to PAINT)

Take a picture of the editor and, along the way, check that it really **paints** an
extension's tokens.

## 1. The feature

The **`editor.captureScreenshot`** command — "Capture the editor (PNG)" — in the
command palette. It saves a PNG of the editor area into the user's downloads
folder and notifies with the path (with a button to reveal the file in the file
manager).

| Piece | Where |
| --- | --- |
| Contract (IPC + types) | `src/shared/screenshot.ts` |
| Capture and write | `src/main/ipc/screenshot.ts` (`webContents.capturePage()`) |
| Bridge | `src/preload/index.ts` → `api.screenshot.capture({ rect, dir, name })` |
| Command + notice | `src/renderer/src/features/editor/screenshot.ts` |

### Why the main does the capture

The editor canvas is **WebGL**. From the renderer you cannot read its pixels:

- `canvas.getContext('2d')` returns `null` (there is already a GL context), and
- `canvas.toDataURL()` comes out empty because the buffer is composed and cleared
  when the frame ends.

`webContents.capturePage()` returns the **already composed** page, i.e. the exact
pixels the user sees (theme, highlighting, cursor, everything), and the crop is
done right there with the display's real scale (HiDPI included). The renderer only
says *which* area it wants and *where* to save it.

## 2. Why it exists (beyond taking a picture)

Before this, the most that could be verified from outside was that the tokens
reached the engine. Whether the editor **painted** them went unchecked.

And the first verification I tried was **wrong**: counting "tinted pixels" inside
the canvas. The canvas is semi-transparent over the app wallpaper, so the
background gradient contributed thousands of colored pixels and the metric said
"there is color" with and without the extension. A false green, which is worse than
a red test.

What does work is **A/B over the same area**:

```
1. with the language extension installed     → capture A
2. uninstall it, reload, same file           → capture B
3. count the pixels that go from NEUTRAL (gray/white text) to VIVID
```

Those pixels are, literally, the tokens the extension painted. In the probe of the
dynamic path: **550 neutral → vivid px** (string orange, comment green, keyword
violet) and ~1,500 strong changes, over the same file and the same rectangle.

## 3. Tools

Two utilities, no dependencies:

```bash
# Color map as text (letter per class: R/Y/G/C/M, g = gray, . = background)
node tools/_look-png.mjs capture.png [columns] [--bright] [--crop=x,y,w,h]

# A/B comparison of two captures + which colors changed
node tools/_look-png.mjs before.png after.png [columns]
```

`tools/lib/png-read.mjs` decodes PNG (zlib + unfilter, no dependencies) and exposes
the `diffNeutralToVivid(before, after)` helper the probe uses. The decoder is
hand-written because Electron's PNG is always the same simple case and a native
dependency was not worth it for this.

Typical use from a probe:

```js
const shot = await evaluate(ws, `api.screenshot.capture(${JSON.stringify({
  dir: '/tmp/innerta-shots', name: 'editor-with-extension', rect
})})`)
```

## 4. See the result

End to end (builds, assembles the test `.sef` and compares captures):

```bash
npm run build
node tools/_make-dynamic-sef.mjs <tree-sitter-javascript.wasm>
xvfb-run -a node tools/_probe-dynamic-app.mjs          # leaves the PNGs in /tmp/innerta-shots
node tools/_look-png.mjs /tmp/innerta-shots/editor-without-extension.png \
                         /tmp/innerta-shots/editor-with-extension.png
```

The probe also prints where the captures ended up, and the app command leaves its
own in `~/Descargas/innerta-<date>.png`.
