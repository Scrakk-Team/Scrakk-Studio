# Sistema de Extensiones SEF (Scrakk Extension Format)

Extiende la app con paquetes que aportan tres tipos de contribuciones: **paneles**,
**botones de la activity bar** y **tabs centrales**. Un paquete es:

- una **builtin** (`.tsx`/`.ts` compilados dentro del bundle de la app), o
- un **`.sef` instalado por el usuario** (zip descomprimido en `userData/extensions/<id>/`).

En ambos casos la fuente de verdad es un `manifest.json` **declarativo**: el
manifest DEFINE todo (id, nombre, contribuciones) y el loader resuelve los
componentes por ruta y los registra en el `ExtensionRegistry`. No existe
`activate(ctx)` ni ejecución arbitraria: cada contribución es un componente
React montado por los sistemas ya existentes de la app.

## Índice

- [Estructura](structure.md) — dónde vive cada pieza del sistema.
- [Manifest](manifest.md) — el formato del `manifest.json`.
- [Empaquetado .sef](sef.md) — cómo armar un paquete instalable.
- [Contribuciones](contributions.md) — paneles, botones y tabs.
- [Paneles](panels/panel.md) — qué son y cómo se montan.
- [Activity bar](activitybar/button.md) — botones de la barra de actividades.
- [Tabs centrales](centerTabs/tab.md) — pestañas del strip central.
- [Builtin](builtin.md) — cómo crear una extensión que viaja en la app.

## En una línea

1. La extensión declara contribuciones en `manifest.json`.
2. El **loader** las convierte en `PanelEntry`/`ActivityBarButton`/`RegisteredCenterTab`.
3. El **ExtensionRegistry** las guarda y notifica.
4. La app (layout, activity bar, tabs) consume el registry y se re-renderiza sola.