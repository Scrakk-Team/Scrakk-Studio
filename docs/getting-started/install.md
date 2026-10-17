---
title: "Install"
group: start
order: 20
summary: "How to get Scrakk Studio: the installers published on GitHub Releases (AppImage/deb/tar.gz on Linux, NSIS .exe on Windows) and building from source with npm."
---
# Install

There are two ways to run Scrakk Studio: install a prebuilt artifact from
**GitHub Releases**, or build the desktop app **from source**. Releases are cut
automatically when a `vX.Y.Z` tag is pushed (see [Updates](../updates.md)); the
source route is what contributors use.

## From GitHub Releases

Open <https://github.com/Scrakk-Team/Scrakk-Studio/releases/latest> and pick the
artifact for your OS. The targets are defined in `electron-builder.yml` and
produced by `.github/workflows/release.yml`.

| OS | Artifacts | Notes |
|---|---|---|
| Linux | `.AppImage`, `.deb`, `.tar.gz` | `linux.target` in `electron-builder.yml` |
| Windows | NSIS `.exe` installer | `win.target: nsis`; no MSI is built |
| macOS | `dmg` target configured, **not published** | `release.yml` only builds Linux and Windows |

Linux:

```bash
chmod +x Scrakk-Studio-*.AppImage
./Scrakk-Studio-*.AppImage            # portable, self-updating

sudo apt install ./Scrakk-Studio-*.deb   # or double-click in your package manager
```

Only the **AppImage** self-updates through `electron-updater`. On `deb`,
`tar.gz` or a source checkout, the update notice links to the release instead of
installing it in place.

## From source

Requirements: **Node.js 22+** (the tooling imports `.ts` files directly via type
stripping) and npm. The CI and release workflows pin Node **24**.

```bash
git clone https://github.com/Scrakk-Team/Scrakk-Studio.git
cd Scrakk-Studio
npm install          # runs postinstall → node node_modules/electron/install.js
npm run dev          # electron-vite dev (hot reload on the renderer)
```

`npm run dev` starts Electron with Vite HMR. For a production bundle and the
installers:

```bash
npm run build        # electron-vite build + native/copy-node.mjs
npm test             # Vitest suite
npm run dist         # electron-builder → release/
npm run dist:dir     # unpacked dir only (no installer)
```

`npm run build` runs `node native/copy-node.mjs` to place the native `.node`
addon next to the main bundle in `out/main/`. The `.node` files load outside the
asar because `electron-builder.yml` lists them under `asarUnpack`.

### Optional native pieces

- **Text engine (Innerta)** — ships precompiled as WebAssembly:
  `src/renderer/public/innerta/innerta.js` plus `innerta.wasm` (~4.9 MB). No
  emscripten needed to run. Rebuilding the engine requires Emscripten and the
  `InnertaEngine` checkout (see the root `README.md`).
- **Search addon** — `npm run native:build` (napi-rs, needs a Rust toolchain).
  Without the compiled `.node`, search falls back to the TypeScript path.
- **`kolargrep` sidecar** — `npm run native:kolargrep`; `electron-builder.yml`
  copies the binary as an extra resource. If missing, search uses the same
  fallback.
- **Terminal (node-pty)** — prebuilt for `win32`/`darwin`. On Linux run
  `npm rebuild node-pty`; the release workflow does this because CI installs with
  `--ignore-scripts`.

## Limits

- **macOS is not published.** `dmg` exists in `electron-builder.yml`, but
  `release.yml` has only `build-linux` and `build-windows` jobs, so the Releases
  page has no macOS artifact. You can build it yourself from source.
- **No MSI.** Windows ships only the NSIS `.exe` installer.
- **No code signing.** Windows/macOS builds without a certificate trigger the
  system warning; auto-update still works.
- **Linux updates.** Only the AppImage self-updates; `deb`, `tar.gz` and source
  installs get a link to the release.
- **Native toolchains are optional** except where you rebuild them:
  Emscripten for Innerta, Rust for the search addon and `kolargrep`.

## Next steps

- [Quick start](quickstart.md) — open a folder, connect a model, first chat.
- [Project structure](project-structure.md) — what each top-level folder holds.
- [Updates](../updates.md) — how version detection and installation work.
