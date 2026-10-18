---
title: "The `lspServers` extension kind (SEF)"
group: lsp
order: 50
summary: "Extensions can contribute complete language servers declaratively — without running code. The handler validates the manifest and syncs with the main-process LSP runtime over IPC."
---
# The `lspServers` extension kind (SEF)

Extensions can contribute **complete language servers** declaratively — without
running code. The handler validates the manifest and syncs with the main-process
LSP runtime over IPC.

## Manifest

Declared like this inside `manifest.json`:

```jsonc
// manifest.json
{
  "id": "my-lsp-pack",
  "name": "My LSP Pack",
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

### Fields per server

What each `lspServers` entry accepts:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Globally unique; collides with a builtin → the extension wins over the builtin, loses to user/project |
| `command` | string | Binary, `"host:port"`, or `./path` INSIDE the package (see below) |
| `args` | string[] | Optional |
| `extensions` | object | ext → languageId (dot optional) |
| `rootMarkers` | string[] | Optional; per-project gating |
| `gatedBy` | string | Only register if package.json declares the dependency |
| `install` | recipe | `{ kind: npm\|go\|gem\|dotnet\|github\|custom, … }` — the same machine as the builtins |

### A server that travels INSIDE the package

Many LSPs are not a system binary: their entry is a node module that comes with
the extension. For that case the `command` is written **relative to the package**:

```jsonc
"lspServers": [{
  "id": "toml",
  "command": "./server/out/server.js",     // ← relative to the package
  "extensions": { "toml": "toml" }
}]
```

The handler absolutizes it against the package root before registering it (the
manager only knows how to look in PATH, in `~/.scrakk/lsp/{bin,npm/.bin}` or
install by recipe — a file inside an extension is in none of the three). The rule
is **explicit** (the `./` or `../` prefix): guessing by "it has a slash" would
break a `command` like `node_modules/.bin/x`, which can come from PATH.

The `args` follow the SAME rule (a `./…` is resolved against the package; a flag
like `--stdio` stays intact), which is what a node server needs:

```jsonc
"command": "node",
"args": ["./server/out/server.js", "--stdio"]
```

Watch out for the interpreter: `command` is the EXECUTABLE. A `command` pointing
straight at a `.js` only works if the file has a shebang and the execute
permission — otherwise, use `node` as the command and the script as an arg.

## Final priority

Who wins between the layers:

```
project (<root>/.scrakk/lsp.json)
 > user (~/.scrakk/lsp.json)
  > dynamic (lspServers extensions)   ← this kind
   > builtin (detected catalogue)
```

## Lifecycle

1. **Boot/install**: the generic loader dispatches each contribution to the
   handler → `api.lsp.registerDynamicServers(extensionId, defs)`
   (merge by id if the extension contributes several servers).
2. The manager invalidates the per-root loads; the new servers start **lazily** on
   the next matching file.
3. **Uninstall**: `removeDynamicServers(extensionId)` — they disappear from the
   registry and stop routing.
4. **User off switch**: Settings → Servers has an On/Off button per server (they
   appear labeled `Extension · <id>`). The preference is persisted in the renderer
   and pushed to the main, which applies it in its ONLY start path
   (`startClient`): a disabled server really does not run — and if it was running,
   it is stopped (its diagnostics are cut).

   ```ts
   // what travels (IPC)
   lsp:set-disabled-servers  { ids: ['ocaml'] }
   lsp:get-disabled-servers  → { ids: ['ocaml'] }
   ```

   In `status()` a disabled server is still LISTED with `disabled: true` (otherwise
   there would be no way to turn it back on from the UI).

## Where it lives

The code of the `lspServers` kind:

```
src/renderer/src/services/extensions/types/lsp/
├── api.ts     # handler (kind 'lspServers') toward the extensions layer
├── logic.ts   # sync with the main runtime (IPC)
├── schema.ts  # validation of the manifest slice + recipe
└── store.ts   # state of the kind (the on/off lives in
               # services/lsp/disabledServers.ts, which belongs to the IDE, not the kind)
```

## API available to extensions (`ctx.api.lsp`)

Every contribution handler receives `ctx.api` with the full LSP namespace:

```ts
ctx.api.lsp.status()
ctx.api.lsp.request({ method, params, filePath?, broadcast?, serverName?, timeoutMs? })
ctx.api.lsp.readDiagnostics(paths)
ctx.api.lsp.drainDiagnostics(timeoutMs?)
ctx.api.lsp.notifyFileChanged(path, content)
ctx.api.lsp.notifyFileClosed(path)
```

So an extension with code can consume core navigation/diagnostics without
duplicating clients.
