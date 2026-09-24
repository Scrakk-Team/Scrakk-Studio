---
title: "Sistema de Extensiones SEF (Scrakk Extension Format)"
group: extensions
order: 10
summary: "Extiende la app con paquetes que aportan contribuciones declarativas: una builtin o un .sef que instala el usuario."
---
# Sistema de Extensiones SEF (Scrakk Extension Format)

Una **extensión** agrega funcionalidad a Scrakk Studio —un panel, un tema, una
herramienta de IA— **sin tocar la app**: lo describís en un `manifest.json` y
Scrakk lo registra solo. Un paquete puede ser:

- una **builtin** (`.tsx`/`.ts` compilados dentro del bundle de la app), o
- un **`.sef` instalado por el usuario** (zip descomprimido en
  `userData/extensions/<id>/`).

El manifest más chico posible ya es una extensión válida: muestra un panel que
dice "Hola".

```json
{
  "id": "hola",
  "name": "Hola",
  "version": "1.0.0",
  "contributes": {
    "panels": [{ "id": "hola", "title": "Hola", "component": "panels/Hola.tsx" }]
  }
}
```

En ambos casos la fuente de verdad es un `manifest.json`: el manifest DEFINE
todo y el loader resuelve los componentes por ruta y los registra en el
`ExtensionRegistry`, que alimenta los sistemas ya existentes de la app.

## Dos tipos de extensión

| | **SEF declarativa** | **SEF con código** |
| --- | --- | --- |
| De dónde sale la UI | del bundle del paquete (React) | del **Extension Host**: la extensión corre en su proceso Node y sirve su contenido por IPC |
| Qué kinds usa | `panels`, `activityBar`, `centerTabs`, `themes`, `fileIcons`, `productIcons`, `encodings`, `notifications`, `lspServers`, `languages`, `tools`, `skills` | `views` (+ `runtime` en el manifest) |
| Ejemplo | builtin `clock` | una extensión de VS Code convertida (Comment Anchors, Cline) |
| ¿Necesita Node? | no | sí |

La declarativa no ejecuta código de la extensión. El sabor con código sí, y
por eso pasa por el Extension Host: `views` es la puerta declarativa (el IDE
sabe que el panel existe **antes** de ejecutar nada) y el contenido llega
después, del host.

## Índice

- [Estructura](structure.md) — dónde vive cada pieza del sistema.
- [Manifest](manifest.md) — el formato del `manifest.json`.
- [Empaquetado .sef](sef.md) — cómo armar un paquete instalable.
- [Contribuciones](contributions.md) — **los trece tipos**, con ejemplo y dónde se montan.
- [Vistas (con código)](views/view.md) — paneles de la activity bar servidos por el host.
- [Paneles](panels/panel.md) — paneles React de un slot del layout.
- [Botones del header](panels/header-actions.md) — acciones de un panel, reordenables arrastrando.
- [Activity bar](activitybar/button.md) — botones de la barra de actividades.
- [Tabs centrales](centerTabs/tab.md) — pestañas del strip central.
- [Builtin](builtin.md) — cómo crear una extensión que viaja en la app.
- [Extensiones de VS Code](vscode.md) — qué hace hoy el pipeline VSIX → SEF.

## En una línea

1. La extensión declara contribuciones en `manifest.json`.
2. El **loader** (`loader/resolve.ts`) itera `contributes` y le pregunta al
   **ExtensionTypeRegistry** por el handler de cada key — no conoce ningún tipo.
3. El handler valida (`schema.ts`), registra (`api.ts` → `logic.ts` → `store.ts`)
   y la app (layout, activity bar, tabs, temas) se re-renderiza sola.

Agregar un tipo de contribución = crear `types/<kind>/` con sus cuatro archivos
y sumar **una línea** a `ensureTypesRegistered()` en `types/index.ts`.
