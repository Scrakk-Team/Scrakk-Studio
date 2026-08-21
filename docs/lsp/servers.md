# Servidores builtin, detección y auto-instalación

## Detección

Al cargar un root se descubren los builtins que cumplen TODO:

1. El binario existe en **PATH**, o en `<root>/node_modules/.bin/`.
2. Si el server es `gatedBy` (linters): el `package.json` del proyecto declara
   esa dependencia.
3. Ningún server de capas superiores (user/project/dinámicos) usa su nombre —
   los builtins solo llenan huecos.

Los servers builtin declaran `rootMarkers`: para routear un archivo, debe
existir un marker caminando desde el archivo hacia arriba hasta el root
(`nearest_root`, mismo algoritmo del CLI/opencode). Así `rust-analyzer` no
arranca para un `.rs` suelto fuera de un proyecto Cargo.

## Catálogo (~26 lenguajes)

typescript/js/jsx · eslint (gated) · biome (gated) · python/pyright ·
rust/rust-analyzer · go/gopls · c/cpp/clangd · java/jdtls · kotlin · ruby ·
bash · lua · css/scss · html · json · yaml · markdown/marksman · zig ·
elixir · dart · prisma · terraform · dockerfile · cmake · vue · svelte.

Cada uno define `extensions` (ext → languageId LSP) y la mayoría `rootMarkers`.

## Auto-instalación

Si un server no está instalado pero su definición tiene **receta**
(`install`), el manager lo instala on-demand con timeout de 300 s:

| Receta | Ejecuta | Binario resultante |
|---|---|---|
| `npm` | `npm i -g --prefix ~/.scrakk/lsp/npm <pkg>` | `~/.scrakk/lsp/npm/bin/<cmd>` |
| `go` | `GOBIN=~/.scrakk/lsp/bin go install <pkg>` | `~/.scrakk/lsp/bin/<cmd>` |
| `gem` / `dotnet` | gestor del sistema | PATH del sistema |
| `github` | descarga el asset del latest release y extrae (zip vía fflate, tar nativo) + chmod +x | `~/.scrakk/lsp/bin/<cmd>` |
| `custom` | argv arbitrario | según el script |

Condiciones de seguridad:

- **Gate por extensiones**: antes de instalar se escanea el workspace
  (presupuesto 8000 entradas, saltando node_modules/.git/dist/…) buscando
  archivos de las extensiones del server. Si no hay ninguno, no se instala.
- **Opt-out global**: env `SCRAKK_DISABLE_LSP_DOWNLOAD=1` desactiva toda
  descarga.
- Tras instalar, el `command` del config se reescrita a la ruta gestionada.

## Recetas actuales

| Server | Receta |
|---|---|
| typescript | npm `typescript-language-server typescript` |
| python | npm `pyright` |
| bash | npm `@bash-lsp/bash-language-server server` |
| json/css/html | npm `vscode-langservers-extracted` |
| yaml | npm `yaml-language-server` |
| go | go `golang.org/x/tools/gopls@latest` |
| markdown | GitHub release marksman (linux-x64) |

## Agregar un server propio

Tres caminos, sin tocar código:

1. **`.scrakk/lsp.json`** (usuario o proyecto) — ver
   [configuration.md](configuration.md).
2. **Extensión SEF** con `contributes.lspServers` — ver
   [extensions.md](extensions.md) (soporta receta de instalación y markers).
3. **PR al catálogo** (`src/main/lsp/builtinServers.ts`) si es útil para
   todos: `{ id, command, extensions, rootMarkers?, gatedBy?, install? }`.
