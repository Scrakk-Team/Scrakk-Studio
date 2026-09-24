---
title: "Tipo de extensión `lspServers` (SEF)"
group: lsp
order: 50
summary: "Las extensiones pueden aportar language servers completos de forma declarativa — sin ejecutar código. El handler valida el manifest y sincroniza con el runtime LSP del proceso main vía IPC."
---
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
| `command` | string | Binario, `"host:port"`, o `./ruta` DENTRO del paquete (ver abajo) |
| `args` | string[] | Opcional |
| `extensions` | object | ext → languageId (punto opcional) |
| `rootMarkers` | string[] | Opcionales; gating por proyecto |
| `gatedBy` | string | Solo registrar si package.json declara la dependencia |
| `install` | receta | `{ kind: npm\|go\|gem\|dotnet\|github\|custom, … }` — misma máquina que los builtin |

### Un server que viaja DENTRO del paquete

Muchos LSPs no son un binario del sistema: su entry es un módulo node que viene
con la extensión. Para ese caso el `command` se escribe **relativo al paquete**:

```jsonc
"lspServers": [{
  "id": "toml",
  "command": "./server/out/server.js",     // ← relativo al paquete
  "extensions": { "toml": "toml" }
}]
```

El handler lo absolutiza contra la raíz del paquete antes de registrarlo (el
manager sólo sabe buscar en el PATH, en `~/.scrakk/lsp/{bin,npm/.bin}` o
instalar por receta — un archivo adentro de una extensión no está en ninguno de
los tres). La regla es **explícita** (el prefijo `./` o `../`): adivinar por
"tiene una barra" rompería un `command` como `node_modules/.bin/x`, que puede
venir del PATH.

Los `args` siguen la MISMA regla (un `./…` se resuelve contra el paquete; un
flag como `--stdio` queda intacto), que es lo que necesita un server node:

```jsonc
"command": "node",
"args": ["./server/out/server.js", "--stdio"]
```

Ojo con el intérprete: el `command` es el EJECUTABLE. Un `command` que apunta
directo a un `.js` sólo funciona si el archivo tiene shebang y permiso de
ejecución — si no, va `node` como command y el script como arg.

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
4. **Apagado por el usuario**: Ajustes → Servidores tiene un botón
   Encender/Apagar por server (aparecen con la etiqueta `Extensión · <id>`).
   La preferencia se persiste en el renderer y se empuja al main, que la aplica
   en su ÚNICO camino de arranque (`startClient`): un server apagado no corre de
   verdad — y si estaba corriendo, se apaga (se cortan sus diagnósticos).

   ```ts
   // lo que viaja (IPC)
   lsp:set-disabled-servers  { ids: ['ocaml'] }
   lsp:get-disabled-servers  → { ids: ['ocaml'] }
   ```

   En `status()` un server apagado sigue LISTADO con `disabled: true` (si no,
   no habría forma de volver a encenderlo desde la UI).

## Dónde vive

```
src/renderer/src/services/extensions/types/lsp/
├── api.ts     # handler (kind 'lspServers') hacia la capa extensions
├── logic.ts   # sync con el runtime main (IPC)
├── schema.ts  # validación del slice del manifest + receta
└── store.ts   # estado del tipo (el apagado/encendido vive en
               # services/lsp/disabledServers.ts, que es del IDE, no del tipo)
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
