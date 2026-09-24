---
title: "Arquitectura del sistema LSP"
group: lsp
order: 30
summary: "Cómo se conectan las capas del LSP: renderer → preload → main → servidores, con routing multi-root y el ciclo de vida de cada cliente."
---
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
   timeout (30 s default). Si el `content` es **idéntico** al último sincronizado
   el `didChange` NO se manda (en LSP un cambio sin `range` reemplaza el
   documento entero, así que un cambio vacío lo BORRA en el server).
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

## Diagnósticos: PULL (y push como respaldo)

- **Pull es el camino normal** (`textDocument/diagnostic`, LSP 3.17): el cliente
  anuncia `textDocument.diagnostic` en `initialize` y, si el server devuelve
  `diagnosticProvider`, es él quien pregunta. No es una preferencia de estilo:
  los servers de **CSS/HTML/JSON** eligen TODO su modo de validación con esa
  capability — con push usan `validationDelayMs = 500` **fijo** (y cada cambio
  reinicia el timer, así que una edición dentro de esa ventana CANCELA la
  validación: el error que acabás de escribir no se marcaba nunca), y con pull
  `validate(document)` corre **sin espera** (`registerDiagnosticsPullSupport`).
  Medido en la app compilada (`tools/_probe-lsp-order.mjs`): **+185 ms** de la
  última tecla al diagnóstico, contra +636 ms del push; y durante el tipeo los
  errores llegan en streaming (~180 ms) en vez de esperar a que te detengas.
- El ritmo del pull lo fija `PULL_MIN_INTERVAL_MS` (180 ms por documento, con
  leading edge): el primer cambio después de una pausa sale YA y una ráfaga se
  agrupa — no hay un request por tecla. El renderer ya coalesce a 40 ms
  (`services/lsp/fileSync.ts`).
- **Push sigue soportado y es el respaldo**: se declara
  `publishDiagnostics` siempre, y los servers sin `diagnosticProvider`
  (typescript-language-server viejo, etc.) funcionan igual que antes. Si un
  server anuncia pull y contesta `MethodNotFound`, el cliente **apaga el pull
  para esa sesión** y sigue con push (válvula de escape: sin ella, un
  capability mal puesto dejaría los archivos sin diagnósticos para siempre).
- Los dos caminos terminan en `applyDiagnostics` → mapa por ruta absoluta
  dentro del cliente + broadcast al renderer (`lsp:on-diagnostics`), así que el
  editor no sabe ni le importa por dónde llegó.
- **Con pull, el server ya no avisa nada al cambiar el documento**: el único
  aviso que queda es `workspace/diagnostic/refresh` (el server pide
  re-consultar) y ahí se re-piden los documentos abiertos. Al cerrar un
  documento, el `[]` lo manda el cliente (con push lo mandaba el server).
- Diagnóstico de esta cadena: `SCRAKK_LSP_DEBUG=1` en el proceso main imprime
  cada `notify` (versión, largo, cola) y cada llegada de diagnósticos con su
  origen (`push`/`pull`). Es la forma rápida de responder "¿esto llegó por dónde
  y con qué texto?".
- Tras una edición (`notifyFileChanged`), el manager marca pendientes por
  `(cliente, lifecycle_id)`.
- `drainDiagnostics(timeout)` espera hasta que **todos** los servers con
  pendientes hayan publicado (presencia, no longitud: un "sin errores" cuenta
  como reportado), agrega ERROR/WARNING multi-server y limpia el estado.
  Al vencer el deadline devuelve lo que llegó y conserva lo faltante.
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
