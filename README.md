# Scrakk Studio

**The code editor YOU need.**
Built for comfort. Engineered for speed. Designed for efficiency.

Scrakk adapts to your project and your needs — ranging from a simple terminal to
a damn advanced editor. The same brand ships as a **desktop editor** (this repo)
and as **`scrakk`**, the coding agent that runs in your terminal with full TUI
support or headlessly for scripting.

[Download](https://github.com/Scrakk/Scrakk-Studio/releases/latest) ·
[Docs](https://docs.scrakk.art) ·
[Extensions](https://scrakk.art/extensions) ·
[Discord](https://discord.gg/scrakk) ·
[X](https://twitter.com/scrakk)

## Features

- **Languages** — 30+ languages with tree-sitter grammars and LSP integration,
  covering highlighting, folding, indentation, symbols and more.
- **Text editor** — our own text rendering engine, written in **C++ and compiled
  to WebAssembly** (Innerta), for optimal performance.
- **LSP servers** — the editor understands the LSP protocol and renders its
  output: diagnostics, hover, completion, goto, symbols and semantic tokens.
- **Git** — a dedicated panel with everything you need to manage repositories
  and contributions from inside the IDE.
- **Social** — create an account, connect with friends and chat (much like
  Discord). Share your status, including the project or file you are working on.
- **Agentic chat** — not a simple chat but a full **agent harness**: custom
  tools, permissions, modes, skills and sub-agents, with the provider you prefer.
- **Extensions** — a proprietary **`.sef`** system for custom panels, new
  languages (tree-sitter), AI tools, commands, shortcuts and sections, plus a
  **VSIX compatibility layer** that converts VS Code extensions (themes,
  languages and basic panels) to `.sef`.
- **Themes** — 100+ official and community themes.
- **Models** — 160+ providers; works out of the box with the default
  **DeepSeek V4 Flash**.

## Built for the terminal

Scrakk runs natively in your terminal with full TUI support, or headlessly for
scripting:

```bash
scrakk -p "Build a todo app in React"
scrakk -p "Fix the bug in src/utils/api.ts" --tools read_file,edit,bash
```

```bash
# macOS (Homebrew)
brew install scrakk-cli/scrakk/scrakk
# Linux (curl | npm | cargo)
curl -fsSL https://scrakk.art/install.sh | bash
npm install -g scrakk-cli
cargo install scrakk-cli
# Windows (Scoop | PowerShell)
scoop install scrakk
iwr https://scrakk.art/install.ps1 | iex
```

Then run `/connect` in the TUI to add your API key, or use the free DeepSeek V4
Flash. See the [getting started guide](https://docs.scrakk.art/getting-started).

## Development

Requirements: **Node.js 22+** (the tooling imports `.ts` directly via type
stripping). To rebuild the text engine you also need **Emscripten** and the
`InnertaEngine` checkout.

```bash
npm install
npm run dev        # development
npm test           # test suite (Vitest)
npm run build      # production build
npm run dist       # installer
```

## Repository layout

| Path | What lives there |
| --- | --- |
| `src/main` | Electron main process (FS, LSP, extensions, updates) |
| `src/renderer` | UI (React) and the bridges into the engine |
| `src/shared` | contracts shared by main and renderer |
| `langs/` | language pack (grammars + tree-sitter queries) |
| `tools/` | grammar CLI, pack builder, license tooling |
| `tests/` | Vitest suite |
| `docs/` | documentation and changelog |

## License

Licensed under the **Apache License, Version 2.0** — see [`LICENSE`](./LICENSE).

```
Copyright 2026 Scrakk Studio
SPDX-License-Identifier: Apache-2.0
```

Third-party works included under their own licenses:

- **Twemoji Mozilla** (emoji artwork) — CC-BY 4.0.
- **Lilex** and **JetBrains Mono** (typefaces) — SIL Open Font License 1.1.
- **tree-sitter queries** — Apache-2.0 (nvim-treesitter) and MPL-2.0 (Helix);
  the provenance (project + commit + license) is recorded per language in
  `langs/<id>/grammar.json`.
