# Estructura

El sistema vive en el renderer bajo `services/extensions`, con la excepción de
la instalación/descompresión de `.sef` que corre en el proceso main.

```
src/renderer/src/services/extensions/
├── types.ts                 # Tipos: manifest, contribuciones, registrados, resolver
├── registry.ts              # ExtensionRegistry: store + subscribe
├── boot.ts                  # bootExtensions(): carga builtin + usuario (una vez, desde main.tsx)
├── index.ts                 # Barril de la API pública
├── loader/
│   ├── resolve.ts           # manifest → contribuciones registradas (común a builtin/usuario)
│   ├── builtin.ts           # Resolver de builtin (import.meta.glob embebido en el bundle)
│   └── installed.ts         # Resolver de .sef instalados (lee disco vía IPC, importa el bundle)
└── builtin/                 # Extensiones builtin, una carpeta por extensión
    └── clock/               # Ejemplo: ext "clock"
        ├── manifest.json
        ├── shared/time.ts
        ├── panels/clock/          # Contribución tipo panel
        │   ├── ClockPanel.tsx
        │   ├── ClockPanel.module.css
        │   └── index.ts
        ├── activitybar/clock/     # Contribución tipo botón
        │   └── index.ts
        └── centerTabs/dashboard/  # Contribución tipo tab central
            ├── DashboardTab.tsx
            ├── DashboardTab.module.css
            └── index.ts
```

## Procesos

| Proceso  | Archivo                  | Responsabilidad                                    |
| -------- | ------------------------ | -------------------------------------------------- |
| main     | `src/main/ipc/extensions.ts` | Instalar/desinstalar `.sef`, listar instaladas. |
| preload  | `src/preload/index.ts`   | Expone `window.api.extensions`.                    |
| shared   | `src/shared/extensions.ts` | Contrato IPC + tipos (`ExtensionsApi`).           |
| renderer | `services/extensions/**` | Registry, loaders, boot, builtin.                  |

## Convenciones

- **Barriles**: cada feature exporta un `index.ts`; se importa por alias
  (`@services/extensions`), nunca por rutas relativas largas.
- **Una responsabilidad por archivo**: un componente de extensión vive en su
  carpeta con su `.module.css` y su `index.ts`.
- **Sin stubs**: si una extensión no puede cargar un módulo, se loguea y se
  saltea esa contribución, pero la app no se rompe.