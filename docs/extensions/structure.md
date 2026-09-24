---
title: "Estructura"
group: extensions
order: 110
summary: "El sistema vive en tres lugares según el proceso:"
---
# Estructura

El sistema vive en tres lugares según el proceso:

- **renderer** (`src/renderer/src/services/extensions/**`): registry, loaders,
  boot, builtin y los trece tipos de contribución.
- **main** (`src/main/extensions/**` y `src/main/ipc/extensions.ts`):
  instalación/desinstalación de `.sef`, conversión de `.vsix` y el **Extension
  Host** (el proceso Node que corre el código de las extensiones).
- **shared** (`src/shared/extensions.ts`, `src/shared/extensionHost/**`,
  `src/shared/compatibility/**`): contratos IPC, protocolo del host y el
  pipeline VSIX → SEF.

## Renderer

```
src/renderer/src/services/extensions/
├── manifest.ts              # ExtensionManifest + ExtensionContributions + tipos registrados
├── registry.ts              # ExtensionRegistry: store + subscribe
├── boot.ts                  # bootExtensions(): se llama UNA vez desde main.tsx
├── index.ts                 # Barril de la API pública
├── enabled.ts               # on/off por extensión (persistido)
├── hostBridge.ts            # puente renderer ↔ Extension Host (la UI que la extensión pide)
├── documents.ts             # textDocuments: los archivos del editor hacia el host
├── extensionApi.ts          # ctx.api que reciben los paneles (tooltips, modales…)
├── loader/
│   ├── resolve.ts           # manifest → contribuciones (GENÉRICO: itera contributes)
│   ├── builtin.ts           # builtin: import.meta.glob embebido en el bundle
│   └── installed.ts         # .sef instalados: disco vía IPC + bundle por data-URL
├── types/                   # UN tipo de contribución por carpeta
│   ├── index.ts             # ensureTypesRegistered(): una línea por tipo
│   ├── registry.ts          # ExtensionTypeRegistry (kind → handler)
│   ├── handler.ts           # contrato ExtensionTypeHandler (parse/register/unregister)
│   ├── <kind>/{schema,api,logic,store}.ts
│   └── themes/bootstrap.ts  # tema del primer paint, síncrono
└── builtin/
    └── <ext-id>/manifest.json + panels/… + activitybar/… + centerTabs/…
```

## Main (Extension Host)

```
src/main/extensions/
├── hostManager.ts           # ciclo de vida del host, activación, IPC y storage
├── extensionStorage.ts      # globalState/workspaceState/secretos/ajustes en disco
├── permissions.ts           # jail de paths
└── host/
    ├── hostProcess.ts       # proceso Node: carga ESM/CJS e intercepta require('vscode')
    ├── vscodeApi.ts         # el namespace `vscode` que ve la extensión
    ├── vscodeShim.ts        # Uri/Position/Range/EventEmitter/Disposable…
    ├── dataTypes.ts         # clases de datos (TreeItem, Diagnostic, ThemeIcon…)
    ├── enums.ts             # enums del API (CodeActionKind, StatusBarAlignment…)
    ├── extensionContext.ts  # ExtensionContext real (storageUri, secrets, subscriptions)
    ├── textDocuments.ts     # documentos + proveedores de contenido virtual
    ├── treeViews.ts / webviewPanels.ts / statusBar.ts / diagnostics.ts
    ├── rpc.ts               # framing de mensajes main ↔ host
    └── entry.ts             # entry del host
```

El renderer nunca habla con el host: pide al main y el main decide
(permisos, jail) y rutea.

## Shared

```
src/shared/
├── extensions.ts            # contrato IPC (ExtensionsApi) + canales
├── extensionHost/protocol.ts# mensajes main ↔ host (init, eventos, peticiones)
└── compatibility/
    ├── types.ts             # CompatReport, ConvertedExtension, MappedApi
    └── vscode/
        ├── validate.ts      # capa 1: ¿es un .vsix legible y válido?
        ├── kinds.ts         # capa 2: tabla honesta por contribution point
        ├── extract.ts       # lectura del zip, resolución de archivos
        ├── analyze.ts       # qué APIs del código usa (cobertura)
        ├── translators/     # capa 3: un traductor por contribution point
        │   ├── registry.ts  # TRANSLATORS: agregar soporte = una entrada
        │   └── types/<kind>/
        └── pipeline.ts      # capas 4-5: verificar y construir el .sef
```

## Convenciones

- **Barriles**: se importa por alias (`@services/extensions`), nunca por rutas
  relativas largas. Con una excepción deliberada: `types/views/logic.ts` usa
  rutas profundas a `features/extensionviews` para que el boot no arrastre el
  componente React del panel.
- **Una responsabilidad por archivo**: `schema` valida, `api` es el handler del
  registry, `logic` registra y aplica, `store` guarda y da de baja.
- **Sin stubs**: si una contribución no puede cargarse, se loguea y se saltea
  esa contribución. Nunca se finge algo que no se hizo.
- **Nada de estado global en los tipos**: el estado vive en su `store.ts` y se
  expone por subscribe/emit, como el resto del repo.
