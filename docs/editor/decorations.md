---
title: "Decoraciones del editor — subrayado por rango"
group: editor
order: 10
summary: "El subrayado (errores, TODO, imports sin usar) lo dibuja el canvas del motor dentro del texto, no un overlay DOM. Una API central reparte las decoraciones a cada editor."
---
# Decoraciones del editor — subrayado por rango

El subrayado (la ondulación de un error, el trazo de un `TODO`, el aviso de un
import sin usar) se dibuja **dentro del plano del texto**, por el canvas del
motor. No es un overlay DOM: un overlay necesita `lineToY/colToX` —la geometría
que Innerta **no** expone— y además se desincroniza con el scroll y no mide
tabs ni anchos dobles.

```
LSP (diagnósticos)      ┐
extensiones (vscode)    ├─→ @services/decorations ─→ cada engine vivo → SetInnertaUnderlines
búsqueda, git, SEF      ┘        (por archivo, por fuente)
```

## 1. El canal del motor

```c
void SetInnertaUnderlines(const int* data, int count);   // sextupletes
void ClearInnertaUnderlines();
int  GetInnertaUnderlineCount();                          // diagnóstico
```

`count` es el total de **ints** (6 por rango), al estilo de bookmarks, tokens y
plegado: el array se arma con `malloc` + `HEAP32` en el loader (un array de JS se
coerciona a número → `0` = `NULL`, y la copia saldría de la dirección 0).

Cada rango:

```
(startLine, startCol, endLine, endCol, rgba, style)
```

| Campo | Qué es |
| --- | --- |
| líneas / columnas | 0-based, la misma convención que el resto del puente |
| `rgba` | `0xRRGGBBAA` (el orden que lee `ColorFromRGBA`) |
| `style` | `0` ondulada · `1` recta · `2` punteada · `3` doble |

**La ondulada usa la geometría de VS Code, medida de su SVG, no una inventada.**
Allá el squiggle es un tile de **6×3 px repetido en X**
(`getSquigglySVGData`, `viewBox='0 0 6 3'`, `repeat-x bottom left`): una **sierra
de 3 px de alto, 6 px de periodo y tramos a 45°**. El motor dibuja lo mismo,
**1 px más abajo** que la raya recta: el glifo se centra en la celda con
`lineHeight = ascender + descender + 2`, así que las 2 últimas filas están libres
y una sierra de 3 px no entra sin comerse el descendente de g/j/p/q/y. VS Code
tiene la misma restricción (su línea por defecto es 1.5 em) y también apoya la
sierra en el borde inferior.

Sobre el suavizado, sin mentir: el SVG de VS Code lo rasteriza el navegador con
antialias; aquí `DrawLine` emite un **quad sólido** y `SetAntialiasMode` sólo
guarda un flag (no hay AA en el backend GL), así que a 45° el trazo sale
escalonado. A 1 px de grosor la diferencia es un píxel de borde, no de forma.

> La primera versión usaba **0.75 px de alto y 4 px de periodo** y *no se veía
> ondulada*: con un trazo de 1 px, los vértices caían dentro del mismo par de
> filas y el resultado se leía como una **raya recta**. La amplitud tiene que
> superar el alto del trazo para que la onda exista **en píxeles**, y por eso
> VS Code usa 3 px.

Detalles que importan:

- **Un rango puede cruzar líneas.** El motor lo recorta a la parte visible de
  cada línea, así el host no tiene que saber dónde termina cada línea del buffer.
- **El tramo lo mide el layout del motor** (`HitTestTextRange`), la misma fuente
  que el caret y el resaltado de la palabra bajo el cursor: el subrayado queda
  alineado con el caret **por construcción**. Ojo con el detalle real: el modelo
  de texto del motor es monoespaciado (`x = columna × charWidth`), así que en un
  tab o un glyph ancho los dos se desvían igual — el punto es que no se
desvíen *distinto*.
- **Un array vacío es la orden de limpiar** (`count = 0`). Es lo que el puente
  manda al abrir otro archivo y al cerrar la tab; omitir la llamada dejaría los
  subrayados del archivo anterior.
- **Un rango de ancho CERO (`start == end`) se ensancha a UN carácter.** No es
  un caso raro: el server de CSS reporta `} expected` con `3:0 → 3:0` y
  `semi-colon expected` igual. El motor dibuja de columna a columna, así que 0
  de ancho son 0 píxeles; el ancho mínimo lo pone `packDecorations` (el modelo
  del motor es monoespaciado: un carácter = un avance). Sin esto el problema
  existía en el store y en el panel, y en el editor **no se pintaba nada**.
- `GetInnertaUnderlineCount` existe porque `setUnderlines` es `void`: sin el
  getter, el puente sólo puede afirmar "mandé los rangos", no "el motor los
  tiene" (el mismo criterio que `GetInnertaFoldingCount`).

> Antes esto era un **stub vacío** (`SetInnertaUnderlines(const wchar_t*) {}` con
> su `g_underlines` declarado y nunca leído): el host podía mandar subrayados
> para siempre sin que se pintara un pixel, y no había forma de distinguirlo de
> "no los pide".

## 2. El store (`@services/decorations`)

Un rango se registra **por fuente** y **por archivo**:

```ts
setDecorations('diagnostics:lsp:tsserver', '/w/a.ts', [
  { startLine: 4, startCol: 8, endLine: 4, endCol: 12, color: 0xf14c4cff, style: 'wavy',
    message: 'no se puede asignar a un tipo `string`' }
])
```

La lectura AGRUPA todas las fuentes (`getDecorations(path)`), y `path` filtra
por archivo porque cada módulo WASM es **una** vista: los errores de `a.ts` no
pueden aparecer sobre `b.ts`.

| Función | Para qué |
| --- | --- |
| `setDecorations(sourceId, path, list)` | reemplaza lo de esa fuente en ese archivo (`[]` borra) |
| `clearDecorations(sourceId, path?)` | baja una fuente (archivo o entera) |
| `getDecorations(path)` | lo que se empuja al motor |
| `getDecorationsAt(path, line, col)` | lo que hay debajo del puntero (hover; un rango vacío cuenta como su carácter) |
| `packDecorations(list)` | los sextupletes (formato del motor) |
| `themeColor(cssVar, fallback)` | var del tema → `0xRRGGBBAA` |

Por qué multi-fuente: con **una** lista por archivo, el último que escribe pisa al
otro. `tsc` publica y borra el subrayado del linter, y viceversa — el mismo bug
que ya tuvo el panel de Problemas.

**Velocidad de cambio**: dos listas iguales no emiten. Los servers repiten
`publishDiagnostics` en cada tecla y hay N engines vivos (uno por tab): sin el
corte, cada repetición recorrería todos los módulos para redibujar lo mismo.

## 3. Diagnósticos (LSP + extensiones)

`services/lsp/decorations.ts` es un **adaptador**, no un store: la verdad sigue
en `diagnosticsStore`. Una fuente de diagnósticos = una fuente de decoraciones:

```
diagnostics:lsp:<server>          → color/label por severidad
diagnostics:extension:<pub.name>  → idem
```

| Severidad | Estilo | Color (var del tema) |
| --- | --- | --- |
| Error | ondulada | `--color-danger` |
| Advertencia | ondulada | `--color-warning` |
| Información | ondulada | `--color-info` |
| Sugerencia | **punteada** | `--color-text-muted` |

El color se lee del tema **al pintar** y se re-aplica cuando el tema cambia: un
tema que redefine su rojo de error se ve tanto en el panel como en el editor.

`initDiagnosticsDecorations()` (llamado en `main.tsx`) arranca el canal y
reconcilia con un **diff**: borrar todo y volver a poner haría parpadear el
subrayado de todos los archivos abiertos en cada keystroke.

**Hover**: pasar el puntero por encima del subrayado muestra el mensaje del
problema, arriba del hover del lenguaje (`diagnosticsAt` + `diagnosticHoverText`).

## 4. Extensiones de VS Code (`editor.setDecorations`)

```ts
const type = vscode.window.createTextEditorDecorationType({
  textEditorDecorationType: 'underline wavy red'
})
vscode.window.activeTextEditor.setDecorations(type, ranges) // Range[] o DecorationOptions[]
```

Camino completo: el host **parsea** la cadena «CSS» (estilo + color), guarda los
rangos por archivo y empuja el estado al IDE (`decorations/set` → renderer →
store con fuente `extension:<id>`). El parseo vive en el host porque es Node puro
y se testea sin levantar el IDE — el renderer recibe datos, no una cadena.

Formas aceptadas: `textEditorDecorationType` (nueva), `textDecoration` + `color`
(clásica), `hoverMessage` por rango (`{range, hoverMessage}`), y los nombres de
color (`red`, `orange`, …) además de `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`,
`rgba()`.

Una lista vacía borra las del tipo y `type.dispose()` también: es lo que usa la
extensión para limpiar. Al apagarse la extensión (`deactivate` o muerte del
host) sus subrayados se van con ella.

## 5. Límites (dichos, no disimulados)

| Qué | Estado |
| --- | --- |
| Subrayado (4 estilos) + color | ✅ |
| Rango multilínea | ✅ (lo parte el motor) |
| Mensaje del problema al apuntar | ✅ |
| Color de **texto** de una decoración (`color:`) | ❌ el motor sólo pinta el trazo |
| `border`, `overviewRulerColor` (`after`/`before`) | ❌ |
| Decoración por `renderOptions` de cada rango | 🟡 usa el color del **tipo**, no el del rango |
| Ruler de scroll con los problemas | ❌ (es otro slot) |
| Ancho de gutter por severidad | ❌ (es `S5` del plan de `innerta-bridge.md`) |

Nada de esto se finge: lo que no se pinta no se pinta, y la tabla de
compatibilidad (`src/shared/compatibility/surface/`) dice el nivel real de cada
API.

## 6. Cómo se verifica (píxeles, no promesas)

Los tests cubren el payload, el store y el empaquetado (`tests/decorations-store.test.ts`,
`tests/editor-decorations.test.ts`, `tests/lsp-diagnostic-decorations.test.ts`,
`tests/extension-host.test.ts`). Lo único que no se puede probar sin el motor es
lo que el usuario ve, así que hay un probe que lo **mide en píxeles**:

```bash
node tools/_make-decorations-vsix.mjs      # extensión real que subraya
node tools/_probe-decorations.mjs          # app compilada + screenshot
node tools/_probe-lsp-underline.mjs        # LSP real + FORMA del trazo
```

El probe de decoraciones instala esa extensión, abre un archivo, corre su comando
y cuenta píxeles naranjas (decoración de extensión) y rojos (diagnóstico de
error) dentro del canvas del editor, contra la línea base y después de limpiar:

```
naranja=1337 (base 479) · rojo=828 (base 679)  ← subrayado dibujado
naranja=479 rojo=679                           ← al limpiar, vuelve EXACTO a la base
```

**Contar píxeles no alcanza: hay que medir la FORMA.** Una raya recta y una
ondulación pintan las dos, así que `_probe-lsp-underline.mjs` exporta el trazo
como ASCII (fila superior por columna + bbox) y falla si el trazo se queda en una
sola fila. Así se ve una sierra de verdad (rangos de 24 y 16 px):

```
...#....##....#.....#.....##....##....##....##.....#..
.##....####....##..###....###..####.........##........
##..####..####..####..####..####..####..####..####..##
#....##....##....##....##....##....##....##....##....#
   fila superior por columna: 151,150,150,149,151,151,151,150,149,…  ← periodo 6
```

Es la forma que se busca: baja hasta la base cada 6 px y vuelve a subir, 3 px de
alto. Una raya recta daría **una sola fila** y `SUBEN=0 BAJAN=0`.

## 7. Cómo agrega alguien una fuente nueva

```ts
import { setDecorations } from '@services/decorations'

setDecorations('search', path, matches.map((m) => ({
  startLine: m.line, startCol: m.start, endLine: m.line, endCol: m.end,
  color: themeColor('--color-warning', '#cca700'),
  style: 'underline'
})))
```

Sin tocar el motor, sin tocar el host, sin canal nuevo. Basta dar de alta la
fuente (`search`) y limpiarla cuando el usuario cierre la búsqueda.
