---
title: "How it works"
group: extensions
order: 300
summary: "Boot, the generic loader, the type registry and where every piece lives (renderer, main, shared)."
---
# How it works

The system lives across three processes:

- **renderer** (`src/renderer/src/services/extensions/**`): registry, loaders,
  boot and the **14** contribution kinds.
- **main** (`src/main/extensions/**` and `src/main/ipc/extensions.ts`):
  installing/uninstalling `.sef`, converting `.vsix`, and the **Extension Host**
  (the process that runs the extensions' code).
- **shared** (`src/shared/extensions.ts`, `src/shared/extensionHost/**`,
  `src/shared/compatibility/**`): IPC contracts, the host protocol and the
  VSIX → SEF pipeline.

## Boot

`bootExtensions()` is called **once** from `main.tsx`. The order matters:

1. `hydrateEnabled()` — on/off state (disabled ones are skipped).
2. `initExtensionHostBridge()` — the bridge **before anything else**: if the main
   sends a request during an extension's first second and there is nobody to
   answer, it is lost.
3. `installVSCodeBuiltinCommands()` — the VS Code builtin commands, before the
   extensions (an extension may ask for `workbench.action.reloadWindow` while
   starting).
4. `publishTelemetryEnabled()` — the telemetry value travels in `init`.
5. `loadBuiltinExtensions()` — builtins (synchronous, in the bundle).
6. `initExtensionDocuments()` — editor document synchronization.
7. (on idle) `loadInstalledExtensions()` — the user's ones, over IPC.

## The generic loader

`loader/resolve.ts` **knows no types**. It iterates `manifest.contributes`, asks
the `ExtensionTypeRegistry` for each key's handler and delegates:

```text
manifest → registerManifest
  for each (kind, raw) of contributes:
    handler = ExtensionTypeRegistry.getHandler(kind)
    parsed  = handler.parse(raw, { hasModule })      # schema.ts
    for each contribution:
      handler.register(contribution, ctx)             # api.ts → logic.ts → store.ts
      ExtensionTypeRegistry.track(extId, kind, id)    # for a clean unregister
```

`ctx` (`ExtensionTypeContext`) gives the handler: `extensionId`, `isBuiltin`,
`extensionPath` (on-disk root, only for `.sef`), `resolver` (components/icons),
`readFile` (package data) and `api` (the `ExtensionApi`: fs, lsp, tooltips,
notifications).

Adding a new kind = create `types/<kind>/{schema,api,logic,store}.ts` + **one
line** in `ensureTypesRegistered()` (`types/index.ts`).

## The app registry

`ExtensionRegistry` is an external store with `subscribe()`. It holds panels,
activity bar buttons, center tabs and metadata; the app systems (layout, activity
bar, tabs, themes) read it and re-render on their own. It also tracks "which ids
belong to which extension" so it can unregister everything at once.

## Where every piece lives (renderer)

```text
services/extensions/
├── manifest.ts              # ExtensionManifest + ExtensionContributions + registered types
├── registry.ts              # ExtensionRegistry (store + subscribe)
├── boot.ts                  # bootExtensions(): once from main.tsx
├── enabled.ts               # per-extension on/off (persisted)
├── hostBridge.ts            # renderer ↔ Extension Host bridge (what the UI serves)
├── documents.ts             # textDocuments: editor files → host
├── extensionApi.ts          # ctx.api of the handlers (fs, lsp, tooltips, notifications)
├── statusBar.ts             # extension status-bar items
├── webviewPanels.ts         # webview panels as center tabs
├── when.ts                  # `when` clause evaluator
├── vscodeCommands.ts        # VS Code builtin commands (UI side)
├── dynamicSyntax.ts         # per-file dynamic syntax (outline/folds/…)
├── extensionDirs.ts         # on-disk directory of each .sef
├── loader/
│   ├── resolve.ts           # manifest → contributions (GENERIC)
│   ├── builtin.ts           # builtins: embedded import.meta.glob
│   └── installed.ts         # .sef: disk over IPC + bundle via blob-URL
├── types/                   # ONE kind per folder: schema/api/logic/store
│   ├── index.ts             # ensureTypesRegistered(): one line per kind
│   ├── handler.ts           # ExtensionTypeHandler contract
│   └── <kind>/…
└── builtin/<type>/<id>/     # the extensions that ship in the app
```

## Conventions

- **Barrels**: imported through aliases (`@services/extensions`). One deliberate
  exception: `types/views/logic.ts` uses deep paths into `features/extensionviews`
  so the boot does not pull the React panel component.
- **One responsibility per file**: `schema` validates, `api` is the handler,
  `logic` registers and applies, `store` holds state and unregisters.
- **No stubs**: if a contribution cannot load, it is logged and **that**
  contribution is skipped. Nothing is faked.
- **State through subscribe/emit**, never a loose global.

## Next steps

- [Extension Host](extension-host.md) — the process that runs the code.
- [VS Code compatibility](vscode-compatibility.md) — the VSIX → SEF pipeline.
