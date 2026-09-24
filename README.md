# Scrakk Studio

Editor de código con chat de IA, terminal y un motor de texto propio (Innerta).

## Qué es

Scrakk Studio es un IDE de escritorio (Electron + React + TypeScript) con:

- **Innerta** — motor de texto en WebAssembly (WebGL2 + FreeType) que renderiza el
  editor: resaltado, plegado, indentación, multi-cursor y emoji en color.
- **Lenguajes** — gramáticas tree-sitter por lenguaje en `langs/` (wasm + queries),
  cargadas on-demand, con LSP por lenguaje.
- **Chat de IA** — agentes, subagentes, herramientas y proveedores.
- **Terminal** — PTY real (node-pty) renderizado por el mismo motor.
- **Extensiones** — compatibilidad con extensiones de VS Code (temas, iconos,
  paneles, LSP) y un formato propio (`.sef`).

## Requisitos

- Node.js 22+ (el tooling usa *type stripping* para importar `.ts`).
- Para compilar el motor: Emscripten (`emcc`) y el checkout de InnertaEngine.

## Uso

```bash
npm install
npm run dev        # desarrollo
npm test           # tests
npm run build      # build de producción
npm run dist       # instalador
```

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `src/main` | proceso principal de Electron (FS, LSP, extensiones, updates) |
| `src/renderer` | UI (React) y puentes hacia el motor |
| `src/shared` | contratos compartidos main ⇄ renderer |
| `langs/` | pack de lenguajes (gramáticas + queries) |
| `tools/` | CLI de gramáticas, build del pack, licencias |
| `tests/` | suite de Vitest |
| `docs/` | documentación y changelog |

## Licencia

Licensed under the **Apache License, Version 2.0** — ver [`LICENSE`](./LICENSE).

```
Copyright 2026 Scrakk Studio
SPDX-License-Identifier: Apache-2.0
```

Terceros incluidos con su propia licencia (atribuciones):

- **Twemoji Mozilla** (emoji) — CC-BY 4.0.
- **Lilex** y **JetBrains Mono** (tipografías) — SIL Open Font License 1.1.
- **tree-sitter queries** — Apache-2.0 (nvim-treesitter) y MPL-2.0 (Helix),
  con la procedencia (proyecto + commit) en el `grammar.json` de cada lenguaje.
