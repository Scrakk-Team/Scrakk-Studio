# Sistema LSP — Scrakk Studio

Cliente Language Server Protocol completo en el proceso main de Electron,
réplica funcional del sistema LSP de scrakk-cli adaptado a la modularización
de Studio (contrato shared → runtime main → puente preload → API renderer).

## Qué soporta

- **Multi-root real**: N carpetas de workspace, cada archivo se atiende con la
  config del root más profundo que lo contiene. Instancias `name@root`.
- **Multi-server routing**: un `.ts` puede ser atendido por el TS server Y un
  linter a la vez; las respuestas se agregan.
- **Sync incremental**: si el server negocia `change=2`, cada edición envía
  solo el diff (un range edit); fallback automático a full-text.
- **Diagnósticos push** (`publishDiagnostics`) con drain semántico: tras una
  edición se espera a que TODOS los servers pendientes reporten.
- **Restart-on-crash** con backoff exponencial, presupuesto de vida y replay
  real de documentos desde disco.
- **Auto-instalación** de servers por recetas npm/go/gem/dotnet/GitHub/custom.
- **Config en capas**: `~/.scrakk/lsp.json` + `<root>/.scrakk/lsp.json`
  (mismo formato que ya detecta el CLI) + servers dinámicos desde
  extensiones SEF + catálogo builtin con auto-detección.
- **Protocolo moderno**: `$ /progress`, `completionItem/resolve` dirigido,
  semantic tokens e inlay hints (capabilities declaradas).

## Índice

| Doc | Contenido |
|---|---|
| [architecture.md](architecture.md) | Capas, flujo de datos, ciclo de vida, multi-root |
| [configuration.md](configuration.md) | `.scrakk/lsp.json`: formato, capas y prioridades |
| [servers.md](servers.md) | Catálogo builtin, detección, auto-instalación |
| [api.md](api.md) | La API completa para frontend/editor/tools del agente |
| [protocol.md](protocol.md) | Detalles del protocolo soportado y sus límites |
| [extensions.md](extensions.md) | Tipo de contribución `lspServers` en SEF |
| [testing.md](testing.md) | Suite de tests, mock server, cómo correr todo |

## En una línea

El editor o el agente tocan un archivo → el manager resuelve qué servers lo
atienden (por extensión + root markers, en su root dueño), los arranca lazy,
sincroniza el buffer y expone diagnósticos/requests; toda la superficie está
disponible vía `window.api.lsp` (preload) y `@services/lsp` (renderer).

## Dónde vive el código

```
src/shared/lsp.ts                  # contrato IPC + tipos + parser compartido
src/main/lsp/                      # runtime (proceso main)
├── client.ts                      # conexión con UN server (stdio/socket)
├── manager.ts                     # multi-root, routing, drain, restart
├── config.ts                      # carga de .scrakk/lsp.json en capas
├── routing.ts                     # nearest_root + resolve_servers
├── builtinServers.ts              # catálogo + detección
├── install.ts                     # recetas de auto-instalación
└── index.ts                       # handlers IPC
src/main/scrakkFolder.ts           # sistema de carpetas .scrakk (compartido)
src/preload/index.ts               # window.api.lsp
src/renderer/src/services/lsp/     # API pública del renderer
├── api.ts                         # ops tipadas + requests genéricos
├── diagnosticsStore.ts            # cache reactiva multi-server
└── format.ts                      # bloque <lsp-diagnostics>
```
