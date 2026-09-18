# Extensiones de VS Code (pipeline VSIX → SEF)

Lo que hoy hace Scrakk cuando instalás un `.vsix`: **lo convierte a SEF**, y
para lo que no es declarativo levanta el Extension Host. Este doc describe el
estado real del pipeline, no el objetivo.

## Las cinco capas (`shared/compatibility/vscode/pipeline.ts`)

| Capa | Archivo | Qué hace |
| --- | --- | --- |
| 1. Validar | `validate.ts` | ¿Es un ZIP legible y con `package.json` válido? Límites anti-zip-bomb |
| 2. Detectar | `kinds.ts` | ¿Qué tipo de extensión es? Tabla honesta por contribution point: `supported` / `pending` / `unsupported` |
| 3. Traducir | `translators/` | Solo los kinds con traductor intentan convertirse; lo roto se omite con warning |
| 4. Verificar | `pipeline.ts` | Cobertura = traducidos / detectados. Si **nada** se tradujo → error honesto, no se instala una extensión vacía |
| 5. Construir | `pipeline.ts` | Manifest SEF puro + assets. El core SEF nunca ve el `.vsix` |

El id SEF se namespacea: `vscode-<publisher>.<name>` (sanitizado). El `.vsix`
original se guarda para poder **re-traducir** cuando mejora un traductor.

## Qué se traduce hoy (tabla exacta de `kinds.ts`)

| `contributes.*` del VSIX | A dónde va | Estado |
| --- | --- | --- |
| `themes` | → `themes` SEF | **Traducido** (JSON de color, tokens, fuentes) |
| `iconThemes` | → `fileIcons` SEF | **Traducido** |
| `productIconThemes` | → `productIcons` SEF | **Traducido** (font + glyph map) |
| `viewsContainers` + `views` | → `views` SEF | **Traducido**: botón/contenedor declarado antes de ejecutar nada (`visibility: collapsed\|hidden` incluida) |
| `viewsWelcome` | → `views[].welcome` | **Traducido**: el texto y los botones que la extensión declara para su vista VACÍA |
| `main` (el código) | `code` + `runtime` | **Soportado**: el entry corre en el Extension Host |
| `commands` | — | **Pendiente**: se registran en runtime (ya puenteados al registry del IDE); la metadata declarada (título/categoría) todavía no se importa a la paleta |
| `menus` | — | **Pendiente**: los menús/botones declarados en la titlebar todavía no se traducen |
| `configuration` | — | **Pendiente**: los defaults se leen en runtime, pero `getConfiguration().update()` todavía no persiste |
| `languages` (+ `grammars`, `snippets`) | → `languages` SEF (kit) | **Traducido**: asociación de archivos, `language-configuration.json`, gramáticas TextMate, snippets, `configurationDefaults` y `semanticTokenScopes` en UNA contribución. El tokenizador aplica la gramática al abrir/tipear (ver `docs/editor/languages.md` §12) |
| `main` que arranca un **language server** (`vscode-languageclient`) | Extension Host (la lib real) | **Soportado**: el server arranca y el IDE lo CONSULTA (hover, definición, formateo ya se pintan; referencias/resaltado responden). Los diagnósticos se listan en el panel de Problemas. Ver [../lsp/vscode-languageclient.md](../lsp/vscode-languageclient.md) |
| `keybindings` | — | **Sin equivalente**: no hay sistema de keybindings contribuibles |
| `debuggers`, `taskDefinitions`, `problemMatchers` | — | **Sin equivalente**: no hay subsistema de debug/tareas |
| `browser` (web extension) | — | **Sin equivalente**: el host todavía no ejecuta web extensions |
| cualquier otra key | — | **Sin mapeo**: se reporta como "contribution point desconocido" |

El objetivo central del pipeline es "traducir la extensión y que siga
funcionando". El criterio de **cómo** se traduce cada tipo (a SEF declarativo o
al API del host) está en definición — ver "Decisión pendiente" abajo.

## Por qué `views` necesita el host

`viewsContainers` y `views` son declarativos: se traducen y el IDE ya sabe que
el panel existe **antes de ejecutar nada**. Pero el CONTENIDO lo produce la
extensión corriendo (`webview.html`, `getChildren()`), y para eso hace falta el
Extension Host. Ver [views/view.md](views/view.md) y
[structure.md](structure.md#main-extension-host).

## Comandos built-in de VS Code → acciones nativas

Una extensión no sólo usa el API: también **pide comandos del entorno**
(`workbench.action.reloadWindow`, `openSettings`, `terminal.*`, `vscode.open`,
`vscode.diff`…). Medido sobre el bundle de Cline: son los botones de sus
notificaciones y de sus walkthroughs.

El mapa vive en `shared/compatibility/vscode/commands/builtin.ts` y cada fila
tiene UNA de tres rutas:

| Ruta | Qué significa |
| --- | --- |
| `handler` | lo ejecuta Scrakk con una acción nativa (recibe los ARGS: `vscode.open` necesita la URI) |
| `native` | ya existe un comando del IDE que hace eso: se delega |
| `degradation` | no hay equivalente: el error dice POR QUÉ (nunca un "no existe" indistinguible) |

Los que tienen `handler` y `palette: true` se registran en el registry del IDE
(categoría **VS Code**), así que también salen en la paleta. Los que delegan no
se duplican; los que no tienen ruta no se registran: la paleta no ofrece algo
que va a fallar.

Un ejemplo real de la degradación: `vscode.diff` hoy devuelve
`el IDE no tiene el comando "vscode.diff": Scrakk todavía no tiene vista de
diff…`. Eso es un dato, no un error opaco.

## Lo que el host ya cubre

Medido contra extensiones reales (Cline, Comment Anchors):

- `commands`, `window` (notificaciones **con `MessageOptions`**, webview views,
  status bar, `createWebviewPanel`), `workspace` (fs enjaulado, documentos,
  `findFiles`, proveedores de contenido virtual), proveedores de árbol,
  `context.secrets`, `globalState`/`workspaceState`, `setContext`,
  `extensionMode`.
- **Diagnósticos**: se guardan, se consultan y el IDE los LISTA (panel de
  Problemas + chip de la barra de estado con los conteos). Falta el subrayado en
  el editor (el canvas de Innerta todavía no acepta rangos de decoración).
- **Proveedores de lenguaje**: el IDE consulta hover, definición, declaración,
  implementación, tipo, referencias, resaltado de ocurrencias y formateo
  (`provider/query` host ⇄ main). Completions, code lens, links, plegado, tokens
  semánticos, inlay hints y jerarquías se registran y avisan por el log: no hay
  UI para su resultado todavía.
- `env.isTelemetryEnabled` con el valor **REAL** del ajuste de Privacidad y su
  evento `onDidChangeTelemetryEnabled` (el ajuste viaja renderer → main → host;
  el IDE dice la verdad y no intercepta nada de lo que la extensión mande a su
  servidor). `env.shell` sale del sistema (`SHELL` / `ComSpec`) y queda
  `undefined` si no se puede saber.
- `l10n.t`: sin bundles de traducción de la extensión todavía, pero devuelve el
  mensaje con sus placeholders **ya sustituidos** (nunca un `{0}` en pantalla)
  y evita el `l10n.t is not a function` que mataba `activate`.
- Carga de módulos como VS Code: `main` del manifest, CJS con `require`
  interceptado y ESM con `module.registerHooks` (el `vscode` se resuelve a un
  módulo `data:`).

## Lo que falta (reportado con motivo, nunca en silencio)

Proveedores de lenguaje (completion/links/code lens — hover, definición y
formateo ya llegan), `applyEdit`/`WorkspaceEdit` (necesitan que Innerta los
consuma), quick pick e input box, terminal API, watchers de archivos, panel de
Salida real (`createOutputChannel` ya recibe los logs) y tasks/debug/SCM/
comments/notebooks/testing. Todo esto se reporta con motivo; ver
`shared/compatibility/vscode/maps.ts`.

**Decoraciones: ya se pintan.** `createTextEditorDecorationType` +
`editor.setDecorations` subrayan rangos de verdad (ondulada/recta/punteada/doble
con el color que pida la extensión, y el `hoverMessage` se lee al apuntar). El
host traduce la cadena «CSS» de VS Code y el editor la dibuja con el mismo canal
que los diagnósticos — el detalle, en
[../editor/decorations.md](../editor/decorations.md). Lo que todavía no se
pinta de un tipo es el color de TEXTO, el borde y el `overviewRulerColor`.

La familia que toca el EDITOR (UI de la extensión en el gutter/hover/overlay,
LSP consumido, menús, decoraciones) tiene su propio plan de puente:
[../editor/innerta-bridge.md](../editor/innerta-bridge.md). La idea central ahí:
Innerta es una **superficie de render** y la UI la monta Scrakk por encima,
así que agregar UI al editor es **instalar una extensión**, no recompilar WASM.

## Decisión: convertir primero, emular lo que ejecuta

Hay dos rutas y **cada pieza declara la suya en una sola tabla**
(`shared/compatibility/surface/`):

- **`sef`** — Convertir: se traduce a un kind SEF (`themes`, `fileIcons`,
  `productIcons`, `views`). Cero runtime, nada que mantener, se ve nativo.
  Solo aplica a lo declarativo.
- **`host`** — Emular: el código corre en el Extension Host contra el API de
  `vscode`. Aplica a todo, pero cada API faltante es un punto de falla.
- **`none`** — No hay equivalente: se reporta con el motivo, nunca en
  silencio.

El criterio es objetivo: **si el contenido se puede saber sin ejecutar el
código de la extensión, se convierte**; si no, se emula (y se emulan DATOS, no
UI: el panel es de Scrakk, la extensión aporta su contenido).

La tabla tiene tres consumidores y una sola verdad:

| Consumidor | Cómo la usa |
| --- | --- |
| `kinds.ts` (reporte de instalación) | proyección: estado → `supported` / `pending` / `unsupported` |
| `maps.ts` (cobertura del pipeline) | proyección: lo declarativo sale de la tabla; el lado de código dice el estado REAL del host |
| El host (`unsupported()`) | el MOTIVO del error sale de la entrada, no de un string suelto |
| Los tests | audit en runtime en los dos sentidos: lo declarado `real` existe, y nada del host queda sin declarar |

Cambiar el estado de un tipo es cambiar **una línea** en la tabla.

### Verificación

`tests/compat-surface.test.ts` construye el módulo `vscode` con un bridge de
mentira y compara la tabla contra el runtime: si aparece un API sin declarar,
o se declara `real` algo que no existe, falla con el nombre exacto. (Ya pagó
solo: destapó que `workspace.workspaceFolders` reventaba si el bridge devolvía
`undefined`.)
