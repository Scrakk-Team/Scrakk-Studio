# Tipo de extensión `lspServers` (SEF)

Las extensiones pueden aportar **language servers completos** de forma
declarativa — sin ejecutar código. El handler valida el manifest y sincroniza
con el runtime LSP del proceso main vía IPC.

## Manifest

```jsonc
// manifest.json
{
  "id": "mi-lsp-pack",
  "name": "Mi LSP Pack",
  "version": "0.1.0",
  "contributes": {
    "lspServers": [
      {
        "id": "ocaml",
        "command": "ocamllsp",
        "extensions": { ".ml": "ocaml", ".mli": "ocaml" },
        "rootMarkers": ["dune-project", "*.opam"],
        "install": { "kind": "opam" },
        "initializationOptions": {},
        "settings": {}
      }
    ]
  }
}
```

### Campos por server

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | Único global; colisiona con builtin → gana la extensión sobre builtin, pierde contra user/project |
| `command` | string | Binario u `"host:port"` |
| `args` | string[] | Opcional |
| `extensions` | object | ext → languageId (punto opcional) |
| `rootMarkers` | string[] | Opcionales; gating por proyecto |
| `gatedBy` | string | Solo registrar si package.json declara la dependencia |
| `install` | receta | `{ kind: npm\|go\|gem\|dotnet\|github\|custom, … }` — misma máquina que los builtin |

## Prioridad final

```
user (~/.scrakk/lsp.json)
 > project (<root>/.scrakk/lsp.json)
  > dynamic (extensiones lspServers)   ← este tipo
   > builtin (catálogo detectado)
```

## Ciclo de vida

1. **Boot/instalación**: el loader genérico despacha cada contribución al
   handler → `window.api.lsp.registerDynamicServers(extensionId, defs)`
   (merge por id si la extensión aporta varios servers).
2. El manager invalida las cargas por root; los nuevos servers arrancan
   **lazy** en el próximo archivo que matchee.
3. **Desinstalación**: `removeDynamicServers(extensionId)` — desaparecen del
   registro y dejan de routear.

## Dónde vive

```
src/renderer/src/services/extensions/types/lsp/
├── api.ts     # handler (kind 'lspServers') hacia la capa extensions
├── logic.ts   # sync con el runtime main (IPC)
├── schema.ts  # validación del slice del manifest + receta
└── store.ts   # estado del tipo (reservado enabled/disabled)
```

## API disponible para extensiones (`ctx.api.lsp`)

Todo handler de contribución recibe `ctx.api` con el namespace LSP completo:

```ts
ctx.api.lsp.status()
ctx.api.lsp.request({ method, params, filePath?, broadcast?, serverName?, timeoutMs? })
ctx.api.lsp.readDiagnostics(paths)
ctx.api.lsp.drainDiagnostics(timeoutMs?)
ctx.api.lsp.notifyFileChanged(path, content)
ctx.api.lsp.notifyFileClosed(path)
```

Así una extensión de código puede consumir navegación/diagnósticos del core
sin duplicar clientes.
