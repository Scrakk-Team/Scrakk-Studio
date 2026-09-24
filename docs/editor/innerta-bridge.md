---
title: "Innerta como superficie, Scrakk como dueño de la UI"
group: editor
order: 20
summary: "Plan de la familia de extensiones que tocan el editor: agregan cosas al gutter, hovers, menús, decoraciones y UI en caliente y sin recompilar Innerta. Este doc es diseño, no implementación."
---
# Innerta como superficie, Scrakk como dueño de la UI

El editor (**Innerta**) es un motor C++ compilado a WASM. Este doc explica cómo
Scrakk le agrega cosas —gutter, hovers, menús, decoraciones— **en caliente y sin
recompilar el motor**. Es **diseño, no implementación**.

> El otro track del mismo puente — **lenguajes, color y gramáticas**, con sus 4
> fuentes y la carga dinámica de tree-sitter — está en [languages.md](languages.md).

Todo lo que dice "hoy" está medido sobre los dos repos.

```
~/Documentos/Proyectos/InnertaEngine/InnertaEngine-Linux   (C++ → WASM, emscripten)
~/Documentos/Proyectos/BorealChat                          (Scrakk: renderer + host)
```

## 1. La tesis

El error de diseño a evitar: implementar cada feature nueva **dentro** de
Innerta (una función C por feature, un rebuild de WASM por feature). Eso es lo
que pasa hoy con el gutter: para mostrar un marker de Git hay que tocar C++.

La arquitectura correcta:

> **Innerta es una superficie de render** (texto, input, geometría, primitivas).
> **Scrakk es dueño de la UI y de los datos**, y la monta por encima con React.

Con eso, agregar cosas al gutter, un hover o un panel sobre el editor deja de
ser una feature de motor y pasa a ser **una extensión instalada**.

### Los dos carriles (y por qué hacen falta los dos)

| Carril | Quién aporta | Quién pinta | Ejemplo |
| --- | --- | --- | --- |
| **UI** (SEF declarativo) | la extensión trae **componentes React** en su bundle | Scrakk, en un slot del editor | una lane de blame, un hover propio, un panel flotante |
| **Datos** (API `vscode`) | la extensión provee **datos** desde el host (`registerHoverProvider`, diagnósticos…) | Scrakk, con su UI nativa | Cline, un linter, un formatter |

VS Code solo tiene el carril de datos (una extensión nunca aporta UI de editor).
SEF puede tener los dos, y el carril UI es el que da el "sin recompilar".

## 2. El puente HOY — inventario exacto

### 2.1 Ida (Scrakk → engine): 45 métodos, 11 opcionales

`InnertaModule` (`features/editor/engines/innerta/InnertaEngine.ts`). Los
opcionales (`?`) son el sondeo **ad-hoc** de "¿este WASM sabe X?" — existe
porque el WASM es un binario y puede ser más viejo que el renderer.

| Grupo | Métodos |
| --- | --- |
| Ciclo | `init` `shutdown` `frame` `setBounds` `setFocus` `resize` |
| Buffer | `setContent` `openFile` `getText?` `getSelectedText?` `getRevision?` `setCleanRevision?` `getCursor?` `hitTest?` |
| Input | `mouseMove` `mouseLeave` `mouseButton` `scroll` `key` `char` `setWasmClipboard?` |
| Tema | `setTheme` `setBgColor` `setAccentColor` `setTextColor` `setBorderColor` `setTextMutedColor` `setIndentGuideColor` `setTokenColor` |
| Extras | `setLanguage?` `setMinimapVisible?` `setBookmarks?` `heapBytes?` `getCharWidth` `getLineHeight` |
| Cursor/selección | `setCursor?` (ir a la línea: outline e ir a la definición) `setSelection?` (rango exacto: expandir selección) |
| Estructura | `setFoldingRanges?` (tripletes `start, end, kind` desde `folds.scm`) · `getFoldingCount?` / `foldingIsHost?` / `foldingFromEngine?` (el motor dice cuántos rangos tiene, si no son indentación, y si los calculó él con el `folds.scm` del lenguaje embebido) |
| Terminal (mismo WASM) | `setTerminalFont` `terminalMouseButton` `terminalMouseMove` `terminalReadOutput` `isAltScreen` `terminalHasSelection` `terminalGetSelectionText` `terminalClearSelection` `terminalGetCursorRow` `terminalGetCursorCol` |

### 2.2 Vuelta (engine → Scrakk): UN canal de 4 ints

```
Module._innertaOnEvent(type, a, b, c)   // fire-and-forget, sin strings, sin respuesta
```

`ContextMenu(1)` · `CursorChanged(2)` · `RevisionChanged(3)` · `BookmarkToggled(4)`.

### 2.3 Lo que YA funciona (y por eso es el molde, no el problema)

| Molde | Canal | Estado |
| --- | --- | --- |
| **Hover LSP** (dwell 350 ms + `hitTest` + `lspHover` → TooltipHost HTML) | puntero → JS | ✅ **UI de Scrakk dibujada sobre Innerta** |
| **Menú contextual** (ítems de Scrakk, coords del engine) | evento `ContextMenu` | ✅ idem |
| **Bookmarks** (ida + click en el gutter + vuelta) | `setBookmarks(int[])` + `BookmarkToggled` | ✅ el único marker con ciclo completo |
| Theme como **JSON dentro** | `SetInnertaTheme(json)` | ✅ |
| Semantic tokens como **array de ints dentro** | `SetInnertaSemanticTokens(int[], count)` | ✅ **en uso y pintando** (antes: declarado y sin consumir) |
| Rectángulos fuera del canvas (huecos/dim) | `SetInnertaOverlayHoles` / `DimRegions` | ✅ |

> Los dos primeros ya son exactamente el patrón que este plan generaliza:
> **la UI es de Scrakk y se posiciona sobre el canvas.** Hoy está hardcodeada
> (hover y menú de 5 ítems). El plan la vuelve un sistema.

### 2.4 La view API (ya en producción, y es el molde estructural)

`services/innerta/viewFactory.ts` envuelve `InnertaCreateView` con
`InnertaViewOpts`:

```c
mode (custom|editor|terminal|preview), lsp, syntax, folding, lineNumbers,
readOnly, cursorStyle, cursorBlink
```

La usa el panel de terminal. Y `InnertaViewSetReadOnlyRanges(ranges, count)` ya
es **un payload por rangos empujado desde el host** — el precedente exacto de lo
que el paint list necesita.

Además el doc de `viewFactory` ya dice: *"en WASM cada módulo es 1 vista, así
que la vista ES la ventana del módulo"*.

### 2.5 Lo que Innerta declara y NO implementa

`src/Core/API/innerta_api.cpp`:

```cpp
INNERTA_API void INNERTA_CALL SetInnertaDiffDecorations(const wchar_t* /*json*/) {}  // ← vacío
```

`g_diff_states` se guarda/no se dibuja. Es el caso testigo de por qué el puente
necesita un handshake de capabilities: una promesa sin implementación no se
puede distinguir de "no la pide".

**Actualizado**: `SetInnertaUnderlines` **ya no es un stub**. Era
`void SetInnertaUnderlines(const wchar_t*) {}` (con su `g_underlines` declarado y
nunca leído) y ahora es el canal real de subrayados por rango —sextupletes
`(startLine, startCol, endLine, endCol, rgba, style)`, dibujo ondulado/recto/
punteado/doble y `GetInnertaUnderlineCount`—. Ver
[decorations.md](decorations.md): es el canal que usan los diagnósticos (LSP y de
extensión) y `editor.setDecorations`.

### 2.6 El gutter hoy dibuja exactamente tres cosas

`Graphics/Gutter/GutterRenderer.h` (geometría = única fuente de verdad para
dibujo **y** hit-test):

```
[números] [icono bookmark 12px, a 12px del texto] [chevron de fold, a 6px] | texto
```

Constantes: `kBookmarkIconSize 12`, `kBookmarkIconRight 12`, `kFoldChevronCenter 6`,
`kGhostAlpha 0.30`. Todo lo demás del gutter (diff, severidad, blame) **no existe**.

### 2.7 Gramáticas: 20 tree-sitter compiladas DENTRO del binario

`emscripten/queries/`: bash, c, cpp, c_sharp, css, go, html, java, javascript,
json, lua, markdown, markdown_inline, python, ruby, rust, toml, tsx, typescript,
yaml.

Y el mapeo de color ya existe y es **lossy**: `innertaTheme.ts` tiene
`scopeToSlot()` — scope TextMate → **15 slots** de `SetInnertaTokenColor`
(0 keyword, 1 string, 2 number, 3 comment, 4 function, 6 type, 7 operator,
9 property, 10 class, 11 constant, 12 parameter, 13 tag, 14 attribute), por
**substring matching**, con `resolveTokenSlots()` aplicando el tema en "gana el
último".

O sea: hoy el editor **categoriza** el color; no lo resuelve por scope real. Eso
es un techo duro para temas de TextMate, y se arregla en el mismo canal que las
decoraciones (§5.3).

**Actualización**: el host ya resuelve scopes de verdad y los manda por el canal
de tokens (ver [languages.md](languages.md) §12): gramáticas TextMate de
extensiones, tree-sitter dinámico (`.wasm` del paquete, en un `utilityProcess`
aparte) y semantic tokens del LSP, fusionados por prioridad. El techo de 15 slots
del motor sigue siendo real; lo que ya es real es que el SLOT lo elige el tema
(`tokenColors` entra como regla del resolutor) y que se puede AUDITAR: el comando
`editor.inspectTokens` muestra por archivo y por fuente el scope stack, el slot y
el color de cada token.

**Y el molde de "el host sabe, el engine dibuja" ya no es sólo color.** Tres
canales nuevos siguen EXACTAMENTE el patrón de los bookmarks (payload por
puntero, `malloc` + `HEAP32` + `free`, ver `innertaLoader.ts`):

```c
SetInnertaFoldingRanges(const int* data, int count)  // tripletes start,end,kind
ClearInnertaFoldingRanges()
GetInnertaFoldingCount() / GetInnertaFoldingIsHost()  // diagnóstico
SetInnertaSelection(anchorLine, anchorCol, activeLine, activeCol)
ClearInnertaSelection()
```

El de plegado obligó a tocar `FoldingManager`: la heurística de indentación
regeneraba los rangos en cada cambio de buffer, así que ahora hay un modo host
(`SetHostRanges` / `ClearHostRanges`) que la desactiva mientras haya rangos del
árbol y **preserva el estado plegado** por línea de inicio (re-tokenizar no puede
desplegar lo que el usuario plegó). Una lista vacía es la orden de volver a la
indentación — es lo que manda el puente al abrir otro archivo, y sin eso el motor
se quedaba con los folds del archivo anterior.

Los dos getters de plegado no son decorativos: `setFoldingRanges` es `void`, así
que `applyInnertaFolds` los usa para COMPARAR lo que pidió con lo que el motor
tiene (`getFoldingCount()` / `foldingIsHost()` en el loader). Sin eso su valor de
retorno sería "la llamada no lanzó", que es un verde falso con todas las letras.

## 3. Los 5 servicios que Innerta debe exponer UNA vez

Ninguno es "una feature": son canales genéricos. Después de esto, ninguna
feature nueva toca C++.

| # | Servicio | Por qué | Estado |
| --- | --- | --- | --- |
| **S1** | **Geometría out**: `textXOffset`, `gutterWidth`, `scrollOffset`, `firstVisibleLine`, `visibleLines`, `lineHeight`, `charWidth`; `lineToY(line)`, `colToX(line,col)` | es **el** hueco: existe el inverso (`InnertaHitTest`) y las métricas, pero no line/col → píxel, y el scroll es de solo escritura | ❌ **nada de esto existe** (verificado en los exports del build) |
| **S2** | **Eventos de viewport** por el canal único: `ViewportChanged`, `Resized`, `FocusChanged`, `MarkerClick` | sin esto, la UI anclada no sigue el scroll | ❌ (el enum tiene 4) |
| **S3** | **Paint list in**: spans + paleta (JSON) | lo que debe vivir **dentro** del plano del texto: color de sintaxis, subrayados, fondos, bordes. Reemplaza `SemanticTokens`+`Underlines`+`DiffDecorations` | 🟡 el **color ya pinta** por el canal de tokens (LSP + TextMate de extensión + tree-sitter dinámico, ver [languages.md](languages.md) §12), el **plegado por árbol** entra por su propio canal y los **subrayados ya pintan** ([decorations.md](decorations.md): diagnósticos + `editor.setDecorations`); fondos y diff siguen pendientes |
| **S4** | **Edición por rango**: `SetInnertaTextRange(range, text)` | hoy toda escritura termina en `setContent(texto completo)` → **resetea el undo** | ❌ |
| **S5** | **Lanes del gutter**: declarar anchos → el engine corre el texto | sólo si una lane necesita espacio propio; si no, es DOM sobre el gutter actual | ❌ |

> `S1` es el gate de casi todo: **lo anclado al puntero ya funciona hoy**
> (hover, menú); lo anclado al **texto** (caret, línea, rango) necesita `S1`.

## 4. El sistema de slots (nuevo tipo SEF)

Un **slot** es una zona con un anclaje donde Scrakk monta React. Innerta no sabe
qué hay adentro.

| Slot | Dónde | Anclaje | Primeros clientes (dogfooding) |
| --- | --- | --- | --- |
| `gutter` | izquierda del texto, por línea | `line` o `range` | Git diff, bookmarks (ya), severidad de diagnósticos, blame, coverage |
| `hover` | flotante junto a un símbolo | `position` (puntero o caret) | hover LSP (**ya funciona**), hovers de extensión |
| `overlay` | flotante libre, 2D | `pointer` o `caret` | menú contextual (**ya funciona**), completion, quick pick, peek |
| `inline` | dentro del flujo del texto, entre caracteres | `position` | inlay hints, code lens, ghost text |
| `ruler` | barra lateral de scroll | `line` | diagnósticos, resultados de búsqueda |
| `title` | encabezado del editor | — | acciones de editor de la extensión |

Reglas de la capa DOM (para no romper el input del editor):

- contenedor con `pointer-events: none`; **solo los widgets** con `auto`;
- un widget nunca come `keydown` (el foco sigue siendo del canvas);
- el ancla se recalcula con `ViewportChanged` (`S2`) — no en cada frame;
- si un slot no tiene clientes, no se monta nada (cero costo).

### 4.1 El tipo SEF

**Va en SEF, no en la capa de compatibilidad**: `services/extensions/types/editorui/`
(`schema.ts` + `api.ts` + `logic.ts` + `store.ts`, como los otros 10 tipos).
Nombre del kind a decidir: `editorUI` / `editor` / `innerta`.

```jsonc
// manifest.json de una extensión SEF
{
  "contributes": {
    "editorUI": [
      {
        "id": "blame",
        "slot": "gutter",
        "anchor": { "kind": "line" },
        "component": "ui/Blame.tsx",          // React del bundle (igual que panels)
        "trigger": { "kind": "always" },       // always | dwell | click | hover
        "when": "resourceExtname == .ts",
        "order": 100,
        "commands": ["miExt.abrirBlame"]        // lo que el componente puede ejecutar
      },
      {
        "id": "mi-hover",
        "slot": "hover",
        "anchor": { "kind": "position" },
        "trigger": { "kind": "dwell", "ms": 350 },
        "component": "ui/Hover.tsx"
      }
    ]
  }
}
```

Contexto que recibe el componente:

```ts
{
  path, languageId,
  line, col, range?,
  pointer?: { x, y },
  visibleRange,
  geometry: { lineToY, colToX, scrollOffset, lineHeight, textXOffset, gutterWidth },
  textOfLine: (line: number) => string,
  commands: { execute(id: string, ...args: unknown[]): Promise<void> }
}
```

Lo que ya existe y se reusa **sin inventar nada**: el loader de componentes del
bundle (`types/panels`), el ciclo de vida de extensiones, el evaluador de `when`
(`services/extensions/when.ts`) y el registry de comandos.

## 5. Las tres respuestas que pedía el plan

### 5.1 LSP consumido de verdad

**La inteligencia ya está**: `docs/lsp/api.md` documenta el cliente completo en
el main (19 operaciones, multi-root, multi-server, semantic tokens, inlay hints,
store reactivo de diagnósticos, `$/progress`, rename, code actions).

Lo que falta es repartir cada operación en su ruta natural:

| Operación | Cómo se muestra | Servicio que necesita |
| --- | --- | --- |
| Hover | slot `hover` (ya funciona) | — |
| Ir a definición / refs / jerarquías | slot `overlay` + lista propia | `S1` para anclaje en caret |
| Completion / firma / rename | slot `overlay` (UI nativa de Scrakk) | **`S1`** |
| Diagnósticos | paint list (squiggle) + marker en `gutter` | **`S3`** |
| Semantic tokens | paint list | `S3` (hoy ya por el canal viejo) |
| Formateo / code actions / rename edit | **edición por rango** | **`S4`** |

### 5.2 Gutter dinámico

El bookmark **ya tiene el ciclo completo** (host empuja líneas → engine dibuja →
click vuelve por el canal único). El plan lo generaliza:

- `setBookmarks(int[])` → **markers**: `{ kind, line|range, icon, color, tooltip, commandId }[]`.
- Devuelve `MarkerClick(line, index)` por el canal único.
- **Dos implementaciones, en este orden**:
  1. **DOM sobre el gutter** (cero C++): el ancrado por línea sale de `S1`;
     Scrakk pinta las lanes nuevas. Git diff, diagnósticos y decoraciones de
     extensión entran por aquí.
  2. **Lanes declaradas** (`S5`) cuando una lane necesite espacio propio (el
     engine corre el texto). Requiere C++.

### 5.3 Gramáticas

**Tiene doc propio: [languages.md](languages.md)** (con la anatomía de una
extensión de lenguaje de VS Code, las 4 fuentes y la carga dinámica con su
seguridad). La decisión, en corto:

tree-sitter **no es el fallback: es una de las fuentes**. Las 20 gramáticas
compiladas dentro del binario son la fuente **nativa** de esos lenguajes (sin
worker, sin costo de datos), y una gramática que trae una extensión corre en un
**worker** (`web-tree-sitter`, wasm) y entra por el **mismo canal** que las demás.

El puente conceptual que lo permite: **un capture de tree-sitter
(`@type.builtin`, `@variable.parameter`) y un scope de TextMate
(`type.builtin.ts`) son el mismo espacio de nombres con puntos** — y
`MapCaptureColor()` en Innerta **ya asigna prioridades** (comment 100 … variable
10). Así que hay **un solo resolutor de estilos** para las 4 fuentes:

tree-sitter nativo · tree-sitter dinámico · TextMate · semantic tokens del LSP

Ese resolutor es lo que rompe el techo actual de **15 categorías por substring**
(`scopeToSlot`) y lo que hace que un `tokenColors` de tema funcione igual para
las cuatro fuentes.

## 6. Fases

Ordenadas por dependencia y rinde, no por brillo.

| Fase | Qué | Toca C++ | Destraba |
| --- | --- | --- | --- |
| **F0** | **Handshake de capabilities** + contrato versionado (reemplaza el sondeo ad-hoc de 11 métodos opcionales) | no | saber qué puede el WASM cargado (los stubs dejan de mentir) |
| **F1** | **`S1` geometría + `S2` eventos de viewport** | sí (chico) | **toda** la UI anclada al texto: gutter DOM, completion, hints, decoraciones |
| **F2** | **Capa DOM de slots en Scrakk** + sistema de anclaje. Primeros clientes: hover y menú contextual **reescritos sobre el sistema** | no | que "agregar UI" sea montar un componente |
| **F3** | **Gutter como slot** (DOM sobre el gutter): Git diff, severidad, markers, click | no | gutter real sin tocar el motor |
| **F4** | **Tipo SEF `editorUI`** (§4.1) | no | que una **extensión** agregue gutter/hover/UI en caliente |
| **F5** | **`S3` paint list**: squiggles/diagnósticos, fondos, bordes, decoraciones, y el panel de Problemas | sí | 🟡 **los squiggles ya están** ([decorations.md](decorations.md), canal por rangos + `editor.setDecorations`) y el panel de Problemas también; faltan fondos/bordes y el ruler |
| **F6** | **Gramáticas** → se movió al track de lenguajes: [languages.md](languages.md) L3 (tree-sitter dinámico) y L4 (TextMate) | — | — |
| **F7** | **`S4` edición por rango** | sí | formatters, quick fixes y rename **sin perder el undo** |
| **F8** | Lo pesado: inlay hints, code lens, sticky, peek, diff editor, custom editors (ya hay `InnertaCreateView` para vistas propias) | sí | fidelidad fina |

**Dos tracks en paralelo, con fundamentos compartidos.** No hay "camino corto":
el orden sale de las dependencias, y hay una dependencia dura que no se puede
saltear — **el resolutor de scopes + paint list** (`S3`) es de donde dependen las
tres fuentes de color. Ponerlo al final obliga a reescribir las tres.

| Track | Fundamento compartido | Después |
| --- | --- | --- |
| **UI** (F0–F4): slots, geometría, gutter, `editorUI` | **F0** capabilities + **F1** geometría/viewport | F2 capa de slots → F3 gutter → F4 `editorUI` |
| **Lenguajes** ([languages.md](languages.md) L0–L7): 4 fuentes, tree-sitter dinámico, TextMate | **L1** resolutor de scopes + paint list | L2 tipo SEF `languages` → L3 tree-sitter dinámico → L4 TextMate → L5 merge LSP |

El único fork real: `F1` (geometría) y `L1` (resolutor) son ambos "primero", y
tocan el mismo motor. Se pueden hacer en ramas separadas pero **no se pisan**
(una es geometría, la otra es estilos).

## 7. Decisiones abiertas

**D1 — Nombre del kind SEF**: `editorUI` / `editor` / `innerta`.
**D2 — ¿El gutter es DOM sobre el área actual (cero C++) o lanes declaradas (`S5`)?**
Recomendación: DOM primero; `S5` solo cuando una lane necesite ancho propio.
**D3 — ¿Dónde vive el estado de los markers/decoraciones?** El engine es
stateless y recibe lo que le empujen; el estado y la persistencia viven en
Scrakk (hay **N módulos WASM**, uno por tab: el estado no puede vivir ahí).
**D4 — ¿`S1` como funciones de lectura (ints, sin alloc) o JSON?** Recomendación:
ints por `out` pointer para lo que se llama por frame; JSON solo para payloads.
**D5 — ¿Un solo canal de datos (`S3` paint list) o mantener los tres actuales?**
Recomendación: **uno**, y que los tres viejos pasen a ser casos de uso (si no,
cada feature nueva inventa su canal).
**D6 — Gramáticas**: las decisiones están en [languages.md](languages.md) §10
(nombre del kind, worker compartido o por editor, dueño del parser, ¿nativo o
solo wasm?, ¿`tags.scm` habilita outline/goto-definition sin LSP?).
**D7 — ¿Eliminar la duplicación de caminos?** Hoy conviven la API de módulo
(45 métodos, un módulo por tab) y la view API (`InnertaCreateView`, N vistas por
módulo, ya en producción con el terminal). Unificarlas sería un gran ahorro de
RAM en multi-editor.

## 8. Riesgos

| Riesgo | Por qué duele | Mitigación |
| --- | --- | --- |
| El WASM cargado no coincide con el header | ya hay 2 stubs vacíos que "existen" | F0: capabilities + test contra los símbolos reales del `Module` |
| N módulos WASM (uno por tab) | cada feature se multiplica; RAM | D3: motor stateless, estado en Scrakk; medir con `heapBytes?` |
| Dos tokenizadores (tree-sitter nativo + TextMate wasm) | CPU/RAM, y dos verdades de color | tree-sitter default offline, TextMate para lo demás, prioridad explícita; tokenizar solo el rango visible en un worker |
| El overlay DOM se desincroniza en scroll rápido | la UI "flota" mal | re-anclaje por `ViewportChanged`, no por frame; transform en el contenedor |
| El overlay se come el input | el editor deja de escribir | `pointer-events: none` + nunca capturar teclado |
| Duplicar la verdad de cobertura | `surface/` de Scrakk ya existe para esto | cada fase actualiza **una** entrada de la tabla, no una lista nueva |
