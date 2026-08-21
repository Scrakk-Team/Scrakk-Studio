# Manifest

El `manifest.json` es la fuente de verdad de una extensión. Es **declarativo**:
todo lo que la extensión aporta se describe acá; el loader lo convierte en
contribuciones registradas.

```json
{
  "id": "clock",
  "name": "Reloj",
  "version": "1.0.0",
  "author": "Scrakk Studio",
  "description": "Reloj en vivo y dashboard con el tiempo.",
  "engine": ">=0.1.0",
  "contributes": {
    "panels": [],
    "activityBar": [],
    "centerTabs": []
  }
}
```

## Campos

| Campo         | Tipo     | Requerido | Descripción                                              |
| ------------- | -------- | --------- | -------------------------------------------------------- |
| `id`          | string   | sí        | Id único (kebab-case). Identifica a la extensión y define la carpeta de instalación de un `.sef`. |
| `name`        | string   | sí        | Nombre visible.                                          |
| `version`     | string   | sí        | Versión semver.                                          |
| `author`      | string   | no        | Autor.                                                   |
| `description` | string   | no        | Descripción corta.                                       |
| `engine`      | string   | no        | Versión mínima de la app (semver).                       |
| `entry`       | string   | no        | Punto de entrada del `.sef`. Default: `dist/index.js`.   |
| `contributes` | objeto   | no        | Las tres contribuciones: `panels`, `activityBar`, `centerTabs`. |

Los tipos viven en `services/extensions/types.ts` (`ExtensionManifest`,
`ExtensionContributions`, `PanelContribution`, `ActivityBarContribution`,
`CenterTabContribution`).

## Reglas

- El `id` se valida con `/^[a-z0-9][a-z0-9._-]*$/i` y se usa como nombre de
  carpeta de instalación (protege contra path traversal).
- Si falta una contribución o un módulo referenciado, se loguea un warning y
  se saltea — la app no se rompe.
- Un manifest sin `id` se ignora.