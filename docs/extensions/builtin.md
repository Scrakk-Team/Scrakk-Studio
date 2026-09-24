---
title: "Extensiones builtin"
group: extensions
order: 30
summary: "Una builtin es una extensión que viaja compilada dentro del bundle de la app: su código fuente (.tsx/.ts) se embebe con import.meta.glob, así que no se lee nada del disco en runtime. Los temas buil…"
---
# Extensiones builtin

Una builtin es una extensión que viaja **compilada dentro del bundle de la
app**: su código fuente (`.tsx`/`.ts`) se embebe con `import.meta.glob`, así
que no se lee nada del disco en runtime. Los temas builtin, además, se
resuelven **síncronamente** para que el primer paint ya tenga tema aplicado
(`types/themes/bootstrap.ts`).

## Dónde viven

```
services/extensions/builtin/<ext-id>/
├── manifest.json
├── shared/…                # Código compartido de la extensión
├── panels/…                # Contribución tipo panel
├── activitybar/…           # Contribución tipo botón
├── centerTabs/…            # Contribución tipo tab central
└── themes/<id>/theme.json  # Un tema por carpeta (convención del glob eager)
```

Los tipos disponibles son los mismos trece que en un `.sef` (ver
[contributions.md](contributions.md)); `clock` es la builtin de ejemplo para
`panels` + `activitybar` + `centerTabs`, y cada carpeta de
`builtin/themes/<id>/` es una extensión de tema.

## Cómo se cargan

En `loader/builtin.ts`:

- Los **manifests** se leen con `import.meta.glob('../builtin/*/manifest.json', { eager: true })`.
- Los **íconos** se leen con un glob eager (la app necesita los componentes de
  ícono de forma síncrona).
- Los **componentes** se resuelven con un glob lazy (`import.meta.glob`, sin
  `eager`): el módulo se importa recién cuando el panel se monta. Lo que
  envuelve ese import NO es `React.lazy` sino el `load` del `PanelEntry`
  (`panelComponentLoader`), porque el `PanelHost` del layout no tiene
  `Suspense`: ver [panels/panel.md](panels/panel.md).

La clave del glob es `../builtin/<ext-id>/<ruta-del-manifest>`.

## Cómo crear una

1. Crea la carpeta `services/extensions/builtin/<ext-id>/`.
2. Escribe el `manifest.json` (ver [manifest.md](manifest.md)) con sus
   `contributes`.
3. Agrega los componentes o la data en las rutas que el manifest referencia,
   cada uno en su carpeta con su `.module.css` y su `index.ts`.
4. La extensión se registra sola en el próximo boot (`bootExtensions()` de
   `main.tsx`). No hace falta tocar nada más.

## Reglas

- El `id` del manifest debe coincidir con el nombre de la carpeta.
- Los componentes usan los alias de la app (`@features`, `@core`, `@services`)
  y tokens CSS para integrarse con los temas.
- No se pueden instalar/desinstalar desde la UI: vienen con la app.
- Las builtin no pueden aportar `views`: ese tipo existe para extensiones que
  corren código en el Extension Host.
