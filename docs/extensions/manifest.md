# Manifest

El `manifest.json` es la fuente de verdad de una extensión. Es **declarativo**:
todo lo que la extensión aporta se describe aquí y el loader lo convierte en
contribuciones registradas (`loader/resolve.ts`).

```json
{
  "id": "clock",
  "name": "Reloj",
  "version": "1.0.0",
  "author": "Scrakk Studio",
  "description": "Reloj en vivo y dashboard con el tiempo.",
  "engine": ">=0.1.0",
  "permissions": [],
  "entry": "dist/index.js",
  "contributes": { "panels": [], "activityBar": [], "centerTabs": [] }
}
```

## Campos

| Campo | Tipo | Requerido | Descripción |
| --- | --- | --- | --- |
| `id` | string | sí | Id único (kebab-case). Identifica la extensión y define la carpeta de instalación de un `.sef` |
| `name` | string | sí | Nombre visible |
| `version` | string | sí | Versión semver |
| `author` | string | no | Autor |
| `description` | string | no | Descripción corta |
| `engine` | string | no | Versión mínima de la app (semver) |
| `permissions` | string[] | no | Permisos declarados — **deny-by-default**, se piden en runtime |
| `entry` | string | no | Punto de entrada del bundle. Default: `dist/index.js` |
| `runtime` | objeto | no | **Extensión con código**: `{ kind: 'node', entry: 'extension.js' }`. Lo escribe el pipeline VSIX |
| `contributes` | objeto | no | Las contribuciones (ver tabla abajo) |

`runtime` es lo que distingue una extensión declarativa de una que ejecuta
código: si está, el Extension Host carga ese entry y le inyecta el API. Ver
[views](views/view.md) y [VS Code](vscode.md).

## `contributes`

| Key | Tipo del item | Definición |
| --- | --- | --- |
| `panels` | `PanelContribution` | `types/panels/schema.ts` |
| `views` | `ViewContribution` | `types/views/schema.ts` |
| `activityBar` | `ActivityBarContribution` | `types/activitybar/schema.ts` |
| `centerTabs` | `CenterTabContribution` | `types/centertabs/schema.ts` |
| `themes` | `ThemeContribution` | `types/themes/schema.ts` |
| `fileIcons` | `FileIconContribution` | `types/fileIcons/schema.ts` |
| `productIcons` | `ProductIconContribution` | `types/productIcons/schema.ts` |
| `encodings` | — | `types/encodings/schema.ts` |
| `notifications` | — | `types/notifications/schema.ts` |
| `lspServers` | `LspContribution` | `types/lsp/schema.ts` |

> `encodings` y `notifications` **todavía no están declarados** en la interfaz
> `ExtensionContributions` (`services/extensions/manifest.ts`). Funcionan igual
> porque el loader itera las keys del manifest contra el TypeRegistry; el hueco
> es de tipado.

Las interfaces de contribución se re-exportan desde
`services/extensions/manifest.ts` (`PanelContribution`, `ViewContribution`,
`ActivityBarContribution`, `CenterTabContribution`).

## Rutas de módulos

- **Builtin**: relativas a la raíz de la carpeta (`panels/clock/ClockPanel.tsx`),
  resueltas con `import.meta.glob` y embebidas en el bundle.
- **Usuario (`.sef`)**: relativas a la raíz del paquete descomprimido. El
  bundle compilado exporta `modules` (mapa `ruta → Component`) y el loader
  resuelve por esa clave.
- Los `path` de **data** (temas, iconos) apuntan a JSON dentro del paquete y se
  leen por `ctx.readFile`; los de **código** (paneles, botones, tabs) apuntan a
  módulos y se validan con `ctx.hasModule`.

## Reglas

- El `id` se valida con `/^[a-z0-9][a-z0-9._-]*$/i` y se usa como nombre de
  carpeta de instalación (protege contra path traversal).
- Si falta una contribución o un módulo referenciado, se loguea un warning
  nombrando la extensión y el motivo, y se saltea **esa** contribución — la app
  no se rompe.
- Un manifest sin `id` se ignora.
- Una extensión instalada por el usuario queda marcada como tal (`isBuiltin:
  false`) y se puede desactivar sin desinstalar.
