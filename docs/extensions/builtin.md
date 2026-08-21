# Extensiones builtin

Una builtin es una extensión que viaja **compilada dentro del bundle de la
app**: su código fuente (`.tsx`/`.ts`) se embebe con `import.meta.glob`, así
que no se lee nada del disco en runtime.

## Dónde viven

```
services/extensions/builtin/<ext-id>/
├── manifest.json
├── shared/…                # Código compartido de la extensión
├── panels/…                # Contribución tipo panel
├── activitybar/…           # Contribución tipo botón
└── centerTabs/…            # Contribución tipo tab central
```

## Cómo se cargan

En `loader/builtin.ts`:

- Los **manifests** se leen con `import.meta.glob('../builtin/*/manifest.json', { eager: true })`.
- Los **íconos** se leen con un glob eager (la app necesita los componentes de
  ícono de forma síncrona).
- Los **componentes** se resuelven con un glob lazy: `React.lazy` los carga
  recién cuando el panel se monta.

La clave del glob es `../builtin/<ext-id>/<ruta-del-manifest>`.

## Cómo crear una

1. Creá la carpeta `services/extensions/builtin/<ext-id>/`.
2. Escribí el `manifest.json` (ver [manifest.md](manifest.md)) con sus
   `contributes`.
3. Agregá los componentes en las rutas que el manifest referencia, cada uno en
   su carpeta con su `.module.css` y su `index.ts`.
4. La extensión se registra sola en el próximo boot (`bootExtensions()` de
   `main.tsx`). No hace falta tocar nada más.

## Reglas

- El `id` del manifest debe coincidir con el nombre de la carpeta.
- Los componentes usan los alias de la app (`@components`, `@features`,
  `@core`, `@services`) y tokens CSS para integrarse con los temas.
- No se pueden instalar/desinstalar desde la UI: vienen con la app.