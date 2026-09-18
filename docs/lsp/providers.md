# Proveedores de lenguaje (host ⇄ IDE)

Los problemas de un lenguaje pueden resolverse de dos maneras en Scrakk:

1. **Un server del sistema** (o instalado por receta) con config declarativa
   (`~/.scrakk/lsp.json`, `<root>/.scrakk/lsp.json`, `contributes.lspServers`).
   Ese camino lo lleva el `LspManager` y está documentado en
   [architecture.md](architecture.md).
2. **Una extensión de VS Code** que arranca su server con
   `vscode-languageclient` —o que aporta el cálculo sin server, como un linter.

La segunda forma no es config: es CÓDIGO que registra **proveedores** en el API
de `vscode` (`languages.registerHoverProvider(selector, { provideHover })` y
compañía). Este documento explica cómo esos proveedores llegan al editor.

## El camino completo

```
editor (hover / ir a definición / formatear)
  └─ services/lsp (api.ts)                 renderer
       └─ IPC `lsp:request`                 preload
            └─ src/main/lsp/index.ts        main: junta las DOS fuentes
                 ├─ LspManager.request()    servers del sistema
                 └─ queryExtensionProviders()  ← providerBridge.ts
                        └─ cada Extension Host vivo
                             └─ provider/query   (hostProcess.ts)
                                  └─ LanguageProviderRegistry.query()
                                       └─ el proveedor REAL de la extensión
```

Las respuestas de las dos fuentes se agregan en la misma lista
(`LspRequestResponse.results`), con `serverName` = nombre del server **o id de
la extensión**. El editor no distingue: pinta lo que llegue. Es exactamente lo
que VS Code hace con varios providers sobre el mismo selector.

## Qué se consulta hoy

| Tipo | Método del proveedor | Lo pinta el IDE |
|---|---|---|
| `hover` | `provideHover` | ✅ tooltip del editor |
| `definition` | `provideDefinition` | ✅ (menú contextual / atajo) |
| `formatting` | `provideDocumentFormattingEdits` | ✅ (menú contextual "Formatear") |
| `declaration` | `provideDeclaration` | ❌ responde, sin UI |
| `typeDefinition` | `provideTypeDefinition` | ❌ responde, sin UI |
| `implementation` | `provideImplementation` | ❌ responde, sin UI |
| `references` | `provideReferences` | ❌ responde, sin UI |
| `documentHighlight` | `provideDocumentHighlights` | ❌ responde, sin UI |
| `rangeFormatting` | `provideDocumentRangeFormattingEdits` | ❌ responde, sin UI |

**No consultados todavía** (se registran, devuelven un `Disposable` y avisan
UNA vez por el log, con el nombre de la API): `registerCompletionItemProvider`,
`registerSignatureHelpProvider`, `registerCodeActionsProvider`,
`registerCodeLensProvider`, `registerDocumentLinkProvider`,
`registerFoldingRangeProvider`, `registerSelectionRangeProvider`,
`registerSemanticTokensProvider`, `registerInlayHintsProvider`,
`registerCallHierarchyProvider`, `registerTypeHierarchyProvider`,
`registerRenameProvider`, `registerDocumentSymbolProvider`,
`registerWorkspaceSymbolProvider`.

La lista es CERRADA a propósito (ver `LanguageProviderKind` en
`src/shared/extensionHost/protocol.ts`): agregar un tipo es agregar su
serialización **y** su consumidor, no sólo declararlo.

## Decisiones que importan

- **El documento se resuelve en el host.** Si el archivo no está abierto en el
  editor (el caso de "ir a la definición" hacia otro archivo), el host lo lee
  por el canal enjaulado del main y materializa un `TextDocument` real
  (`workspace.textDocuments`). Un proveedor que recibe `undefined` no puede
  hacer su trabajo.
- **Serialización en el host.** `Hover.contents` (string, `MarkdownString`,
  `MarkedString` o array), `Location` **y** `LocationLink` (tsserver/rust
  devuelven el segundo) y `TextEdit[]` se aplanan a la forma del LSP, que es la
  que el editor ya sabe consumir. La conversión vive donde existen las clases
  reales del API.
- **Un proveedor roto no tumba nada.** Si tira, se loguea con el tipo y el
  error, y la consulta sigue (puede haber otro host que sí responda). El
  proveedor tampoco ve un `CancellationToken` cancelable: sin UI de progreso no
  hay cancelación real, y fingirla sería peor.
- **Timeout en el main.** 5 s por consulta: un proveedor colgado no puede
  congelar el hover del editor.
- **Sin hosts no se paga nada.** `hasExtensionProviders()` deja cortar el
  camino cuando no hay ninguna extensión corriendo.

## Cómo probarlo

```bash
# registro + serialización + consulta (host)
npx vitest run tests/language-providers.test.ts

# traducción del pedido LSP y fan-out (main)
npx vitest run tests/provider-bridge.test.ts

# el IDE consultando un proveedor real, extremo a extremo
npx vitest run tests/extension-host.test.ts -t "proveedores de lenguaje"
```

## MIGRACIÓN A OWEAR (leer antes de tocar)

Ninguna de las tres piezas conoce Electron ni stdio:

- `languageProviders.ts` (host) habla documentos y proveedores.
- `providerBridge.ts` (main) es una tabla de una función + un timeout.
- El transporte entre ambos sigue siendo `RpcPeer` (`provider/query`), el mismo
  sobre que los demás métodos del host.

Si Owear cambia el runtime, lo único a revisar es el registro de la función en
`src/main/ipc/extension-host.ts` (que es donde vive el `ExtensionHostManager`).
