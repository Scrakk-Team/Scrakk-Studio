---
title: "Contribuciones"
group: extensions
order: 50
summary: "Cada cosa que aporta una extensión (paneles, temas, botones…) se declara bajo `manifest.contributes`. El loader es genérico: le pide el handler de cada key al registry."
---
# Contribuciones

Una **contribución** es cada cosa que una extensión aporta: un panel, un tema,
un botón. Todas se declaran bajo `manifest.contributes`.

El loader es **genérico**: itera las keys de `contributes` y le pide al
`ExtensionTypeRegistry` el handler de cada una (`loader/resolve.ts`). Una key
sin handler se loguea y se saltea; la app nunca se rompe por una extensión
rota.

Los **trece tipos** que existen hoy:

| Key en `contributes` | Qué aporta | Dónde se monta | Código de la extensión |
| --- | --- | --- | --- |
| `panels` | Panel React del paquete | Cualquier slot del layout | No |
| `activityBar` | Botón que abre un panel | Barra de actividades | No |
| `centerTabs` | Tab del strip central | Strip central | No |
| `views` | Vista de la activity bar **servida por el Extension Host** | Barra de actividades + slot | **Sí** |
| `themes` | Tema de color | Tokens CSS del IDE | No |
| `fileIcons` | Tema de iconos de archivos | Explorador, tabs | No |
| `productIcons` | Tema de iconos de UI | Toda la app | No |
| `encodings` | Encodings de texto | Apertura/guardado de archivos | No |
| `notifications` | Notificaciones de la extensión | Centro de notificaciones | No |
| `lspServers` | Language server | Runtime del proceso main | No (lo lanza el IDE) |
| `languages` | Kit de lenguaje (identidad + `language-configuration`, gramáticas tree-sitter/TextMate, snippets, defaults y semantic tokens) | Editor (resaltado, plegado, indent, LSP) | No |
| `tools` | Herramienta de IA (con visual propio opcional) | Chat con IA + Ajustes → Chat | **Sí** |
| `skills` | Skills (workflows Agent Skills) | Chat con IA + Ajustes → Chat | No (lee `SKILL.md`) |

La columna **Código de la extensión** te dice si el paquete necesita ejecutar
código propio (o sea, el Extension Host): hoy solo `views` y `tools` lo hacen.

Cada tipo vive en `services/extensions/types/<kind>/` con la misma estructura:
`schema.ts` (validación pura) · `api.ts` (handler del registry) · `logic.ts`
(registro/efectos) · `store.ts` (estado + bajas).

## panels

Un panel es un componente React de tu paquete que se monta en un slot del
layout. Se declara así:

```json
{
  "panels": [
    { "id": "clock", "title": "Reloj", "closable": true, "component": "panels/clock/ClockPanel.tsx" }
  ]
}
```

El componente sale del bundle del paquete y se registra como `PanelEntry` con
import dinámico. Ver [panels/panel.md](panels/panel.md).

## activityBar

Un botón de la barra de actividades que abre un panel. Se declara así:

```json
{
  "activityBar": [
    {
      "id": "clock-btn",
      "label": "Reloj",
      "icon": "activitybar/clock/index.ts",
      "side": "left",
      "target": "left",
      "panelId": "clock",
      "order": 60
    }
  ]
}
```

`target` es el `SlotId` donde se monta el panel y `panelId` el panel que abre.
Ver [activitybar/button.md](activitybar/button.md).

## centerTabs

Una pestaña del strip central (se registra también como panel con el mismo id).
Se declara así:

```json
{
  "centerTabs": [
    { "id": "clock-dashboard", "label": "Dashboard", "icon": "centerTabs/dashboard/index.ts", "component": "centerTabs/dashboard/DashboardTab.tsx" }
  ]
}
```

Un tab central se registra **también como panel** con el mismo id. Ver
[centerTabs/tab.md](centerTabs/tab.md).

## views

Una vista servida por el Extension Host (extensión con código). Se declara así:

```json
{
  "views": [
    {
      "id": "pub.ext.chat",
      "name": "Chat",
      "container": "pub.ext.side",
      "containerTitle": "Mi extensión",
      "iconSvg": "<svg …>",
      "order": 10
    }
  ]
}
```

Varias vistas con el mismo `container` comparten **un** botón y **un** panel, y
se apilan como secciones plegables (como VS Code). El contenido no viene del
paquete: lo sirve el Extension Host.

`views` también acepta lo que en VS Code es `visibility` y `viewsWelcome` (el
contenido que la extensión declara para cuando su vista está vacía):

```json
{
  "views": [
    {
      "id": "pub.ext.tree",
      "name": "Árbol",
      "container": "pub.ext.side",
      "collapsed": true,
      "hidden": false,
      "welcome": [
        { "contents": "Nada por aquí.\n[Crear](command:pub.ext.create)", "when": "ext.empty" }
      ]
    }
  ]
}
```

Ver [views/view.md](views/view.md).

## themes / fileIcons / productIcons

Temas de color e íconos; apuntan a un JSON de datos dentro del paquete. Se
declaran así:

```json
{
  "themes": [{ "id": "mi-tema", "name": "Mi tema", "type": "dark", "path": "themes/mi-tema.json" }],
  "fileIcons": [{ "id": "mis-iconos", "name": "Mis iconos", "path": "icons/theme.json" }],
  "productIcons": [{ "id": "mi-ui", "name": "Mi UI", "path": "ui/theme.json" }]
}
```

A diferencia de `panels`/`activityBar`/`centerTabs`, aquí el `path` apunta a
**data** (JSON), no a código: el handler la lee del paquete
(`ctx.readFile`), la normaliza con su schema y la registra. Los temas builtin
se resuelven embebidos por convención de carpeta.

## encodings / notifications

Encodings de texto y notificaciones propias de la extensión. Se declaran así:

```json
{
  "encodings": [{ "id": "koi8-r", "label": "KOI8-R", "aliases": ["koi8r"] }],
  "notifications": [{ "id": "bienvenida", "title": "Hola", "body": "…" }]
}
```

`encodings` alimenta la detección de encoding al abrir un archivo;
`notifications` aporta notificaciones propias de la extensión. Ambos handlers
existen y se registran, pero **todavía no están declarados en la interfaz
`ExtensionContributions`** (`services/extensions/manifest.ts`): funcionan
porque el loader es genérico, y el hueco es de tipado, no de runtime.

## lspServers

Apunta a la definición de un language server; el registro real ocurre en el
proceso main y el renderer solo consume su estado. Ver
[../lsp/extensions.md](../lsp/extensions.md).

## tools

Herramientas de IA que la extensión aporta al chat. Se registran en el mismo
registry que las tools built-in (misma forma, mismo enable/disable, mismo
visual), pero el código de ejecución vive en el paquete: la tool despacha un
**comando** que corre en el Extension Host.

```json
{
  "tools": [
    {
      "name": "acme_deploy",
      "label": "Deploy",
      "description": "Despliega el proyecto actual.",
      "parameters": {
        "type": "object",
        "properties": { "environment": { "type": "string", "description": "prod | staging" } },
        "required": ["environment"]
      },
      "command": "acme.deploy",
      "family": "acme",
      "familyLabel": "Acme Tools",
      "type": "acme-deploy",
      "typeLabel": "Deploy",
      "dangerLevel": "medium",
      "enabledByDefault": false,
      "icon": "server",
      "visual": "tools/deploy/visual.tsx",
      "visualCss": "tools/deploy/visual.css"
    }
  ]
}
```

- `command`: id que la extensión registra con `commands.registerCommand`. El
  resultado se devuelve al modelo como texto (JSON si es un objeto).
- `type`/`family` (+ `typeLabel`/`familyLabel`/`familyIcon`): agrupan la tool en
  Ajustes → Chat → Herramientas (catálogo extensible). Si no existen, se crean
  solos, así una extensión aporta su **pack/familia** de tools. Ver
  [tools.md](tools.md).
- `visual` es opcional: un módulo React del paquete que recibe
  `{ args, result, status }`, igual que las tools internas.
- `permissions` acepta las mismas reglas del motor de políticas
  (`path_block`, `size_limit`, …).
- Una extensión **no puede pisar** una tool built-in: el registry rechaza el
  nombre duplicado.

Ver [tools.md](tools.md).

## skills

Paquetes de skills (estándar Agent Skills): cada entrada apunta a un `SKILL.md`
dentro del paquete. El modelo ve nombre + descripción y carga el contenido solo
cuando lo necesita.

```json
{
  "skills": [
    {
      "name": "release-notes",
      "description": "Genera notas de release desde los PRs mergeados.",
      "path": "skills/release-notes/SKILL.md"
    }
  ]
}
```

Ver [skills.md](skills.md).

## Reglas comunes

- Cada handler valida forma y **existencia del módulo** (`ctx.hasModule`); lo
  inválido se descarta con un warning que nombra la extensión y el motivo.
- Un paquete sin `contributes` válido se registra igual (aparece en Ajustes →
  Extensiones) pero no aporta nada.
- El `id` de cada contribución es global: dos extensiones no pueden declarar el
  mismo `panelId`/`view.id`.
