---
title: "Tests del sistema LSP"
group: lsp
order: 90
summary: "Cómo correr la suite del LSP: qué cubre cada test y cómo usar el mock server."
---
# Tests del sistema LSP

Todo corre con **Vitest**: un archivo por área, más un mock server para no
depender de binarios externos.

```bash
npm test          # toda la suite
npx vitest run tests/lsp/manager.test.ts   # un archivo
```

## Suites

| Archivo | Cubre |
|---|---|
| `config.test.ts` | parse de lsp.json (aliases, normalización de extensiones), fusión usuario→proyecto, descarte de inválidos, defaults de timeouts |
| `routing.test.ts` | nearest_root (markers arriba/abajo/fuera), resolve_servers multi-server con orden alfabético y gating por markers |
| `scrakkFolder.test.ts` | capas `.scrakk`: rutas, lectura tolerante, escritura, merge proyecto>usuario |
| `client.test.ts` | E2E stdio: handshake → ready, didOpen → publishDiagnostics, versiones, definition request, shutdown ordenado (el hijo muere) |
| `client-socket.test.ts` | E2E transport TCP: mock LSP sobre net.Server real |
| `incremental.test.ts` | computeIncrementalChange (puro) + E2E: server incremental recibe range edits; full-sync sigue recibiendo texto completo |
| `protocol.test.ts` | completionItem/resolve dirigido por serverName; $/progress begin/report/end con token único; semanticTokens passthrough |
| `manager.test.ts` | integración: config de proyecto + builtins sin pisar, arranque lazy, drain agregando DOS servers, deadline, requests enrutados/broadcast/dirigidos, readDiagnostics bajo demanda, status con source |
| `multiroot.test.ts` | dos roots con servers distintos (enruta solo al dueño), root anidado más profundo, servers dinámicos: registro/remoción y merge por id |
| `manager-restart.test.ts` | kill SIGKILL real del hijo → crashed → retrying → NUEVO pid → replay verificado; y sin restartOnCrash queda caído |
| `install.test.ts` | argv de recetas npm/go/gem/dotnet/custom, opt-out env, dirs gestionados, scan de extensiones con skip de node_modules |
| `format.test.ts` | bloque `<lsp-diagnostics>` exacto (labels 1-based, escape de tags) |

## Mock language server

`tests/helpers/mock-lsp-server.mjs` — proceso Node que habla JSON-RPC/LSP
real por stdio (framing Content-Length). Configurable por env:

| Env | Efecto |
|---|---|
| `MOCK_INCREMENTAL=1` | negocia `textDocumentSync { change: 2 }` |
| `MOCK_SEMANTIC=1` | capability semanticTokensProvider + data de respuesta |
| `MOCK_DIAG_MESSAGE` / `MOCK_DIAG_LINE` | diagnóstico publicado en open/change/save |
| `MOCK_TARGET` | destino del location en textDocument/definition |

Requests custom para aserciones: `mock/state` → `{ changes, version,
incremental }` (lo último enviado en didChange).

Métodos soportados: initialize, initialized, shutdown/exit, didOpen/
didChange/didSave (publica diagnósticos), definition (con ciclo completo de
$/progress alrededor), hover, completion + completionItem/resolve,
semanticTokens/full.

## Convenciones

- Cada test usa tmpdirs propios (`makeTempDir`) + `SCRAKK_HOME` overrideado —
  nunca toca el home real.
- `waitFor(fn)` hace polling con deadline (los publishes son async).
- Los tests de manager escriben configs vía el propio sistema de capas
  (`writeJsonLayer(projectConfigPath(...))`) — dogfooding total.
