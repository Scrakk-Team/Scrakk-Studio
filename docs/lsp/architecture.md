# Arquitectura del sistema LSP

## Capas

```
┌──────────────────────────────────────────────────────────────┐
│ RENDERER (sandbox)                                            │
│  services/lsp/api.ts          ← ops tipadas + request genérico│
│  services/lsp/diagnosticsStore← cache reactiva multi-server   │
│  services/lsp/format.ts       ← bloque <lsp-diagnostics>      │
│  services/ai/tools/lsp/       ← tool 'lsp' del agente         │
└───────────────▲──────────────────────────────┬───────────────┘
                │ eventos push                  │ invoke
┌───────────────┴──────────────────────────────▼───────────────┐
│ PRELOAD (contextBridge): window.api.lsp                       │
└───────────────▲──────────────────────────────┬───────────────┘
                │                              │
┌───────────────┴──────────────────────────────▼───────────────┐
│ MAIN — src/main/lsp/index.ts (handlers IPC + broadcast)       │
│  manager.ts: roots · routing · clientes · drain · restart     │
│  client.ts : conexión JSON-RPC con cada server (hijo real)    │
│  config/routing/builtinServers/install                        │
└───────────────┬───────────────────────────────────────────────┘
                │ stdio / TCP (JSON-RPC 2.0, Content-Length)
        ┌───────▼────────┐
        │ language server │  ← un proceso hijo por `name@root`
        └────────────────┘
```

El renderer corre sandboxeado: **nunca** toca procesos. Toda operación pasa
por IPC; los eventos push (diagnósticos, estado de servers, progreso) se
difunden a todas las ventanas vivas.

## Ciclo de vida de un cliente

1. **Arranque lazy**: solo cuando un archivo se toca o se hace un request.
2. `resolveOrInstall`: binario en PATH → binario gestionado
   (`~/.scrakk/lsp/{bin,npm}`) → receta de instalación del catálogo/extensión.
3. **Handshake**: `initialize` con timeout (15 s default) → `initialized` →
   `workspace/didChangeConfiguration` si hay settings.
4. **Negociación**: si el server declara `textDocumentSync.change = 2`, el
   cliente activa sync incremental para ese server.
5. **Uso**: didOpen/didChange(versionado)/didSave en cada sync; requests con
   timeout (30 s default).
6. **Shutdown ordenado**: didClose de todos → `shutdown` → `exit` con timeout
   (5 s default) → kill del hijo.

## Multi-root

- `setWorkspace(root)` resetea a UN root primario.
- `addWorkspaceRoot/removeWorkspaceRoot` agregan/quitan roots adicionales.
- Cada root carga sus propias capas de configuración (ver
  [configuration.md](configuration.md)); el user layer es global, el project
  layer es `<root>/.scrakk/lsp.json`.
- **Ownership de archivos**: un archivo pertenece al root más profundo que lo
  contenga como prefijo de ruta; fallback al primario.
- Los servers son instancias por par `(name, root)` — key interna
  `name@root`. El mismo nombre puede correr en dos roots con procesos
  distintos y configs distintas.

## Diagnósticos: push + drain

- Cada server publica vía `textDocument/publishDiagnostics` → mapa por ruta
  absoluta dentro de su cliente + broadcast inmediato al renderer
  (`onLspProgress`-style stream `lsp:on-diagnostics`).
- Tras una edición (`notifyFileChanged`), el manager marca pendientes por
  `(cliente, lifecycle_id)`.
- `drainDiagnostics(timeout)` espera hasta que **todos** los servers con
  pendientes hayan publicado (presencia, no longitud: un "sin errores" cuenta
  como reportado), agrega ERROR/WARNING multi-server y limpia el estado.
  Al vencer el deadline devuelve lo que llegó y conserva lo faltante.

## Restart-on-crash

- Si la config lo pide (`restartOnCrash: true`):
  - detección por salida del proceso/cierre de conexión,
  - backoff exponencial 1 s → 30 s,
  - presupuesto de vida `maxRestarts` (default 3),
  - tras reiniciar: **replay** de documentos (re-lee del disco, reabre,
    reencola diagnósticos).
- Sin la flag: queda `crashed` hasta que el host vuelva a tocarlo.

## Requests

| Modo | Cómo |
|---|---|
| Por archivo | `filePath` → se abre en su(s) server(s) y se enruta ahí |
| Broadcast | `broadcast: true` → todos los corriendo |
| Dirigido | `serverName` → exactamente ese server (completionItem/resolve) |

Los resultados llegan como `results[]` con una entrada por server
(`{ serverName, result?, error? }`); errores individuales no tumban al resto.
