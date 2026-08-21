# Configuración de servers — `.scrakk/lsp.json`

El sistema carga la MISMA configuración que scrakk-cli: dos capas JSON que se
fusionan por nombre de server (el proyecto gana sobre el usuario).

## Capas y prioridad

| Prioridad | Capa | Ruta |
|---|---|---|
| 1 (más alta) | Usuario | `~/.scrakk/lsp.json` |
| 2 | Proyecto | `<root>/.scrakk/lsp.json` |
| 3 | Dinámicos | extensiones SEF con `contributes.lspServers` |
| 4 (más baja) | Builtins | catálogo detectado automáticamente |

Reglas:
- Cada capa solo **llena huecos** respecto a la anterior, salvo
  usuario/proyecto que se pisan entre sí por nombre.
- Una entrada inválida se descarta con warning; jamás tumba el boot
  (tolerancia idéntica al CLI).
- El home de usuario es `~/.scrakk` — overrideable con `SCRAKK_HOME` (tests).

## Formato de un server

```jsonc
// <root>/.scrakk/lsp.json
{
  "typescript": {
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "transport": "stdio",              // stdio (default) | socket ("host:port")
    "env": { "TS_TSC_WATCHFILE": "NodeJs" },
    "extensions": {
      ".ts": "typescript",
      ".tsx": "typescriptreact"
    },
    "initializationOptions": {},
    "settings": {},                     // → workspace/didChangeConfiguration
    "workspaceFolder": "/ruta/alternativa",  // opcional: root propio del server
    "startupTimeout": 15000,
    "shutdownTimeout": 5000,
    "restartOnCrash": true,
    "maxRestarts": 3
  }
}
```

Aliases aceptados (compatibilidad con el CLI): `extensionToLanguage` /
`extensionToLanguageId`, camelCase en todos los timeouts/flags.

Normalizaciones:
- Las extensiones pueden venir sin punto (`ts` → `.ts`) y en cualquier caso.
- Sin `extensions` el server queda registrado pero nunca routeará archivos
  (warning en consola).

## Defaults (idénticos al CLI)

| Parámetro | Default |
|---|---|
| startupTimeout | 15 000 ms |
| shutdownTimeout | 5 000 ms |
| request timeout | 30 000 ms |
| drain diagnostics | 500 ms |
| maxRestarts | 3 |
| backoff restart | 1 s → 30 s exponencial |

## Transporte socket

Con `"transport": "socket"` el campo `command` es `"host:port"` y el cliente
conecta por TCP en vez de spawnear. Útil para servers ya corriendo fuera.

## Ejemplo multi-server

```jsonc
{
  // Lenguaje + linter atienden los mismos archivos (respuestas agregadas).
  "typescript": { "command": "typescript-language-server", "args": ["--stdio"],
                  "extensions": { ".ts": "typescript", ".tsx": "typescriptreact" } },
  "eslint":     { "command": "vscode-eslint-language-server", "args": ["--stdio"],
                  "extensions": { ".ts": "typescript" } },

  // Server remoto ya levantado.
  "remote-py":  { "command": "127.0.0.1:2087", "transport": "socket",
                  "extensions": { ".py": "python" } }
}
```
