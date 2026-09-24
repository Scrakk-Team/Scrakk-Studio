---
title: "Protocolo soportado y límites"
group: lsp
order: 60
summary: "initialize con:"
---
# Protocolo soportado y límites

## Handshake

`initialize` con:

- `processId`, `rootUri` + `rootPath` + `workspaceFolders` (del root dueño,
  o `workspaceFolder` override del config del server).
- Capabilities declaradas (el server NO ofrece lo que no se declara):
  - synchronization didOpen/didChange/didSave
  - publishDiagnostics (relatedInformation, versionSupport)
  - hover plaintext/markdown · definition linkSupport:false · references
  - documentSymbol hierarchical:true
  - completion: resolveSupport (documentation, detail, additionalTextEdits),
    labelDetails, contextSupport
  - signatureHelp documentationFormat
  - **semanticTokens** requests range+full{delta}
  - **inlayHint** resolveSupport (tooltip, textEdits)
  - codeAction literal + dataSupport · callHierarchy · foldingRange ·
    selectionRange · documentHighlight · rename prepareSupport

Después: `initialized` → `didChangeConfiguration` con `settings` si existen.

## Sync de documentos

| Modo | Cuándo | Qué se envía |
|---|---|---|
| Incremental | server declara `textDocumentSync.change = 2` | UN range edit (diff prefijo/sufijo mínimo) |
| Full-text | resto | `{ text }` completo |

Ambos con versión creciente por documento y `didSave` SIEMPRE después
(algunos servers solo publican diagnósticos al save). El contenido actual
queda cacheado en el cliente para calcular diffs.

## Requests y timeouts

- Request default 30 s; configurable por llamada.
- Respuestas agregadas multi-server; cada entrada lleva su serverName.
- `completionItem/resolve` e `inlayHint/resolve` deben ir **dirigidos**
  (`serverName`) porque el resultado depende del server que emitió el ítem.

## Progreso ($/progress)

- `window/workDoneProgress/create` → registra el token.
- `$/progress` begin/report/end → difundido a las ventanas
  (`lsp:on-progress`) con serverName/token/phase/message/percentage.

## Diagnósticos

- `publishDiagnostics` → mapa por ruta absoluta (multi-server) + broadcast.
- Semántica del drain: un server "reporta" cuando PUBLICA para la ruta,
  aunque sea vacío (presencia en el mapa, igual que el CLI).
- Solo ERROR/WARNING se exponen en drain/readDiagnostics/bloque formateado.

## Lo que aún NO está (límites honestos)

- **Delta tokens**: se declara capability pero no se pide `delta`
  sobre `resultId` previo (full en cada pedido).
- **Partial results** (`partialResultToken`): los requests no streamean
  resultados parciales; esperan la respuesta final.
- **didChangeWatchedFiles**: la capability está declarada pero el runtime no
  emite notificaciones por cambios externos (git pull, ediciones fuera).
  Los buffers se refrescan cuando el host toca el archivo.
- **willSave/willSaveWaitUntil, onTypeFormatting, linkedEditing,
  colorProvider, monikers, typeHierarchy**: sin implementar.
- Un server = un root por instancia (no servers compartidos entre roots).

## Timeouts y presupuestos

| Concepto | Valor |
|---|---|
| initialize | 15 s (configurable) |
| shutdown | 5 s (configurable) |
| request | 30 s |
| drain diagnostics | 500 ms |
| readDiagnostics settle | 2 s |
| instalación | 300 s |
| scan workspace (install gate) | 8000 entradas |
| restart backoff | 1 s ×2^n hasta 30 s |
