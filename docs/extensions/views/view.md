# Vistas (paneles servidos por el Extension Host)

`contributes.views` es el tipo de contribución para extensiones que **ejecutan
código** (el caso de las extensiones de VS Code convertidas). El panel existe
en el IDE por declaración, pero su contenido lo produce la extensión corriendo
en su propio proceso.

## Por qué existe (y en qué se diferencia de `panels`)

| | `panels` | `views` |
| --- | --- | --- |
| Componente | módulo del paquete (`component: "…/X.tsx"`) | `ExtensionViewPanel` **del core** |
| Contenido | React del paquete | HTML del webview o árbol, por IPC |
| Necesita el host | no | sí |
| Un botón por | panel | **contenedor** (N vistas comparten botón y panel) |

Una vista no trae UI: trae **identidad y metadata**. El IDE la monta con su
propio panel (`features/extensionviews/ExtensionViewPanel.tsx`), que al abrirse
le pregunta al host qué es esa vista.

## Declaración

```json
{
  "views": [
    {
      "id": "pub.ext.chat",
      "name": "Chat",
      "container": "pub.ext.side",
      "containerTitle": "Mi extensión",
      "iconSvg": "<svg viewBox=\"0 0 24 24\">…</svg>",
      "order": 10
    }
  ]
}
```

- `id`: id global de la vista (`publisher.extension.view`).
- `container`: id del contenedor. Todas las vistas con el mismo `container`
  comparten botón y panel.
- `containerTitle` / `iconSvg`: el botón de la activity bar (el ícono se pinta
  con `currentColor`, así sigue al tema).
- `order`: posición relativa en la barra.

Campos que el traductor agrega desde el VSIX:

| Campo | Origen en VS Code | Qué hace |
| --- | --- | --- |
| `when` | `views[].when` | la vista (y el botón) se muestran solo si la clave de contexto da verdadero |
| `welcome` | `viewsWelcome` | texto + **botones de comando** para cuando la vista está vacía |
| `collapsed` | `visibility: "collapsed"` | la sección arranca plegada |
| `hidden` | `visibility: "hidden"` | la vista arranca oculta (no hay menú de "vistas ocultas" todavía) |

## Qué monta el IDE

`types/views/api.ts` → `logic.ts` registra, **una sola vez por contenedor**:

1. un `ActivityBarButton` (`id: viewButtonId(...)`, `target: 'left'`);
2. un `PanelEntry` (`id: viewPanelId(...)`) cuyo componente es
   `ExtensionViewPanelLoader` — un panel del core, no de la extensión.

`features/extensionviews/` es el lado consumidor:

- `containers.ts`: mapa contenedor → vistas (sin React, para poder importarlo
  desde el boot).
- `ExtensionViewPanel.tsx`: al abrir, llama `host.resolveView(...)`; si la
  extensión devolvió un **árbol**, monta `ExtensionTreeView`; si devolvió
  **webview**, pide `host.webviewUrl(...)` y lo carga.
- `path`/`uri`: los recursos del webview se sirven con las `asWebviewUri` ya
  resueltas por el host.

## Estados del panel

| Estado | Qué se ve |
| --- | --- |
| Sin host todavía | progreso real de activación (qué está esperando el host) |
| `activate` falló | el error del host con su causa, no un timeout pelado |
| Árbol | árbol navegable con `TreeItem`/`ThemeIcon` de la extensión |
| Árbol VACÍO | el `viewsWelcome` de la extensión (texto + botones que corren SUS comandos); si no declaró nada, un mensaje del IDE |
| Webview | el HTML de la extensión en un iframe con CSP propia |
| Sin resolver | mensaje del IDE explicando que la extensión no devolvió esa vista |

## `viewsWelcome`: el vacío lo explica la extensión

Cuando un árbol no tiene nodos, VS Code no muestra el mensaje del IDE: muestra
el que la extensión declaró en `contributes.viewsWelcome`. Se traduce a
`views[].welcome` y `ExtensionTreeView` lo pinta en su estado vacío.

```json
{
  "viewsWelcome": [
    {
      "view": "pub.ext.tree",
      "contents": "Sin anclas todavía.\n[Crear ancla](command:anchors.create?%5B%22x%22%5D)",
      "when": "anchors.empty"
    }
  ]
}
```

- Cada línea con un `[texto](command:id)` es un **botón**; el resto es texto.
- Los args van URL-encoded como los emite VS Code y se parsean de verdad
  (`shared/compatibility/vscode/welcome.ts`): el comando llega a la extensión
  con SUS argumentos.
- Varias entradas por vista, cada una con su `when`.
- Un `viewsWelcome` que apunta a una vista que no existe se reporta en el
  informe de instalación (no desaparece sin dejar rastro).

## Reglas

- El panel es **del core**: la extensión no puede reemplazar su UI, solo su
  contenido.
- Cerrar el panel no baja al host; desinstalar la extensión sí libera el host y
  el botón.
- Las vistas de un contenedor se **apilan** como secciones plegables (como VS
  Code). Arranca abierta la primera que no pidió `visibility: collapsed`; las
  demás se montan cuando el usuario las abre (cada sección puede montar un
  iframe, así que abrirlas todas es un costo que se paga sin mirarlo).
- Una vista sin `container` o sin `id` se descarta con warning.
