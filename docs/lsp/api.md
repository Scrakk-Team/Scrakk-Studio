# API del LSP — superficie completa para frontend/editor/agente

Tres niveles: `window.api.lsp` (crudo, preload) · `@services/lsp` (renderer,
tipado y conveniente) · tool `lsp` del agente. Todo corre sobre el runtime
del proceso main.

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

## Diagnósticos

```ts
// Espera a TODOS los servers pendientes (default 500 ms) y agrega.
const files = await lspDrainDiagnostics(timeoutMs?)
// → FileDiagnostics[] { path, diagnostics: LspDiagnostic[] }

// Lee diagnósticos actuales abriendo los archivos si hace falta.
const entries = await lspReadDiagnostics(['/ruta/a.ts'])
```

### Cache reactiva (store)

```ts
import { getStoredDiagnostics, getProblems, getAllStoredDiagnostics,
         subscribeToDiagnostics } from '@services/lsp'

getProblems('/ruta/a.ts')      // solo ERROR/WARNING
subscribeToDiagnostics(fn)     // stream en vivo (publishDiagnostics)
```

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
