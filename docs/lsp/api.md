---
title: "API del LSP — superficie completa para frontend/editor/agente"
group: lsp
order: 20
summary: "Tres niveles: window.api.lsp (crudo, preload) · @services/lsp (renderer, tipado y conveniente) · tool lsp del agente. Todo corre sobre el runtime del proceso main."
---
# API del LSP — superficie completa para frontend/editor/agente

La API del LSP está en **tres niveles**, según quién la use:

- `window.api.lsp` — crudo, en el preload.
- `@services/lsp` — tipado y cómodo, para el renderer (editor, paneles).
- tool `lsp` — para el agente.

Todo corre sobre el runtime del proceso main.

## Workspace y multi-root

```ts
import {
  setLspWorkspace,        // (rootPath) → servers del root
  lspAddWorkspaceRoot,    // multi-root real
  lspRemoveWorkspaceRoot,
  lspListWorkspaceRoots
} from '@services/lsp'
```

`initLspWorkspaceSync()` (llamado desde `main.tsx`) sincroniza automáticamente
con la raíz que abre el Explorer (evento `workspace-changed`).

## Sync de archivos

```ts
lspNotifyFileChanged(path, content)  // didOpen | didChange | didSave
lspNotifyFileClosed(path)            // didClose en todos los servers
```

El cliente decide solo: si negoció sync incremental manda el diff mínimo;
si no, texto completo. `content` es SIEMPRE el contenido completo nuevo —
el diff lo calcula el runtime.

**Un `content` idéntico al último sincronizado NO manda `didChange`** (sí el
`didSave`). No es una optimización: en LSP un cambio **sin `range`** significa
"reemplazá todo el documento por este texto", así que un cambio vacío BORRA el
documento en el server. Pasaba al guardar (el sync re-manda el mismo contenido),
y el server publicaba 0 diagnósticos: el subrayado y el chip se vaciaban con el
archivo todavía roto. Cubierto por `tests/lsp/incremental.test.ts`.

### El ritmo del sync (renderer)

El editor llama a `lspNotifyFileChanged` por **cada** revisión del buffer
(`services/lsp/fileSync.ts`), con una ventana de **40 ms con leading edge**: la
primera edición de una ráfaga sale YA y lo que se agrupa es el resto. No es un
debounce clásico, que esperaría a que dejes de tipear. Medido con
`tools/_probe-lsp-realtime.mjs` (tipeo real sobre la app compilada).

Después de eso **el cliente LSP no espera a nadie**: pregunta por pull
(`textDocument/diagnostic`, ver `architecture.md`) con un cap de 180 ms por
documento. En los servers de CSS/HTML/JSON eso es la diferencia entre su push
(`validationDelayMs = 500` fijo, que además se reinicia con cada cambio) y
`validate(document)` sin espera. Medido en la app compilada con
`tools/_probe-lsp-order.mjs`: **+185 ms** de la última tecla al diagnóstico
(antes +636 ms con push), **+41 ms** para limpiarlo al deshacer, y errores en
streaming mientras tipeás en vez de uno solo al final.

## Diagnósticos

```ts
// Espera a TODOS los servers pendientes (default 500 ms) y agrega.
const files = await lspDrainDiagnostics(timeoutMs?)
// → FileDiagnostics[] { path, diagnostics: LspDiagnostic[] }

// Lee diagnósticos actuales abriendo los archivos si hace falta.
const entries = await lspReadDiagnostics(['/ruta/a.ts'])
```

### Cache reactiva (store, MULTI-FUENTE)

Los problemas de un archivo llegan por dos canales: el LSP
(`publishDiagnostics`) y el Extension Host (una extensión que publica en su
`DiagnosticCollection`). El store guarda **una entrada por fuente** y la
lectura agrega, así que un linter de extensión y `tsc` no se pisan.

```ts
import { getStoredDiagnostics, getProblems, getAllStoredDiagnostics,
         countProblems, subscribeToDiagnostics } from '@services/lsp'

getProblems('/ruta/a.ts')      // solo ERROR/WARNING (contexto de code actions)
getAllStoredDiagnostics()      // todo, con `sources` (quién lo publicó)
countProblems()               // { errors, warnings, infos, total } — el chip
subscribeToDiagnostics(fn)     // stream en vivo (los dos canales)
```

La UI que lo consume es el panel **Problemas** (layout, `problems`; lo abre el
chip de la barra de estado con los conteos por severidad). Se puede abrir en
cualquier slot:

```ts
toggleSlotPanel('bottom', 'problems')
```

Lo que NO se ve solo en el panel: los mismos problemas se subrayan **dentro
del texto** (canal de decoraciones del motor, ver `docs/editor/decorations.md`).
Ondulado rojo = error, ámbar = advertencia, punteado = pista; el color sale del
tema y al pasar el puntero por encima aparece el mensaje.

### Bloque `<lsp-diagnostics>`

```ts
import { lspAfterEdit } from '@services/lsp/format'

// Gancho post-edición: sync + drain(500ms) + formateo CLI.
// Ya está cableado en write_file / replace_in_file / append_file.
const block = await lspAfterEdit(path, content) // string | null
```

Formato (idéntico al CLI): `<lsp-diagnostics>\nruta:\n  error[L12]: msg\n</lsp-diagnostics>`
con escape de tags de cierre dentro de mensajes.

## Requests genéricos

```ts
const res = await lspRequest(method, params, {
  filePath?,     // enruta a los servers del archivo (abre si hace falta)
  broadcast?,    // todos los corriendo
  serverName?,   // UN server exacto (completionItem/resolve)
  timeoutMs?     // default 30s
})
// res.results: [{ serverName, result?, error? }]
```

## Operaciones tipadas (posiciones 0-based, como el CLI)

| Función | Método LSP |
|---|---|
| `lspGoToDefinition/Implementation/TypeDefinition/Declaration` | textDocument/… |
| `lspFindReferences` | textDocument/references (incluye declaración) |
| `lspHover` | textDocument/hover → contents por server |
| `lspDocumentHighlight` | textDocument/documentHighlight |
| `lspDocumentSymbol` | flat + nested aplanados |
| `lspWorkspaceSymbol(query)` | broadcast |
| `lspCompletion(filePath,l,c)` → ítems **taggeados** con serverName |
| `lspCompletionResolve(filePath, tagged)` | completionItem/resolve dirigido |
| `lspSignatureHelp` | primer signature activo |
| `lspCodeAction(...)` | con diagnostics reales del store como contexto |
| `lspRename(...)` + `flattenWorkspaceEdit(edit)` | ediciones `file:l:c-l:c => newText` |
| `lspFormatting / lspRangeFormatting` | TextEdits por server |
| `lspPrepareCallHierarchy / IncomingCallHierarchy / OutgoingCallHierarchy` | jerarquía de llamadas |

## Semantic tokens e inlay hints

```ts
lspSemanticTokensFull(filePath)             // { data: number[], resultId? } | null
lspSemanticTokensRange(filePath, startLine, endLine)
lspInlayHints(filePath, startLine, endLine)
lspInlayHintResolve(hint)
```

**Elección de resaltado** (storage system, sin UI):

```ts
import { getPersistedHighlightSource, persistHighlightSource } from '@services/storage'
persistHighlightSource('lsp')        // 'treesitter' (default) | 'lsp'
```

Innerta debe leer esta preferencia para decidir entre sus gramáticas
Tree-sitter o pintar semantic tokens del server.

## Progreso $/progress

```ts
onLspProgress(({ serverName, token, phase, title, message, percentage }) => {})
// phase: 'begin' → 'report'* → 'end'
```

## Estado y eventos

```ts
lspStatus()  // [{ id: 'name@root', name, root, state, available, source, extensions }]
onLspServerEvent(cb)   // starting | ready | crashed | retrying | failed | stopped
onLspDiagnostics(cb)   // publishDiagnostics en vivo
```

## Tool `lsp` del agente

Una sola tool con enum `operation` (19 operaciones, posiciones 0-based):
goToDefinition, goToImplementation, findReferences, hover, goToTypeDefinition,
goToDeclaration, documentHighlight, documentSymbol, workspaceSymbol,
completion, codeAction, rename, signatureHelp, documentFormatting,
documentRangeFormatting, callHierarchyIncoming, callHierarchyOutgoing,
prepareCallHierarchy, diagnostics.

- Locations → `path:line:col`; symbols → `name @ path:línea`.
- rename/codeAction devuelven las ediciones para aplicarlas con
  replace_in_file (no escriben solas).
- Las tools de escritura inyectan `<lsp-diagnostics>` tras editar — el agente
  ve sus errores sin pedirlos.
