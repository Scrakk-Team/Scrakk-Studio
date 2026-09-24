---
title: "Capturas del editor (y cómo se verifica que el editor PINTA)"
group: editor
order: 40
summary: "El comando `editor.captureScreenshot` guarda un PNG de la zona del editor. También sirve para verificar que el editor pinta los tokens de una extensión."
---
# Capturas del editor (y cómo se verifica que el editor PINTA)

## 1. La feature

Comando **`editor.captureScreenshot`** — "Capturar el editor (PNG)" — en la paleta
de comandos. Guarda un PNG de la zona del editor en la carpeta de descargas del
usuario y avisa con la ruta (con botón para mostrar el archivo en el gestor).

| Pieza | Dónde |
| --- | --- |
| Contrato (IPC + tipos) | `src/shared/screenshot.ts` |
| Captura y escritura | `src/main/ipc/screenshot.ts` (`webContents.capturePage()`) |
| Puente | `src/preload/index.ts` → `window.api.screenshot.capture({ rect, dir, name })` |
| Comando + aviso | `src/renderer/src/features/editor/screenshot.ts` |

### Por qué la captura la hace el main

El canvas del editor es **WebGL**. Desde el renderer no se pueden leer sus
píxeles:

- `canvas.getContext('2d')` devuelve `null` (ya hay un contexto GL), y
- `canvas.toDataURL()` sale vacío porque el buffer se compone y se limpia al
  terminar el frame.

`webContents.capturePage()` devuelve la página **ya compuesta**, o sea los
píxeles exactos que ve el usuario (tema, resaltado, cursor, todo), y el recorte
se hace ahí mismo con la escala real del display (HiDPI incluido). El renderer
sólo dice *qué* zona quiere y *dónde* guardarla.

## 2. Por qué existe (más allá de sacarse una foto)

Antes de esto, lo máximo que se podía verificar desde afuera era que los tokens
llegaran al motor. Que el editor los **pintara** quedaba sin comprobar.

Y la primera verificación que intenté estaba **mal**: contar "píxeles con tinte"
dentro del canvas. El canvas es semitransparente sobre el wallpaper de la app, así
que el degradado de fondo aportaba miles de píxeles con color y la métrica decía
"hay color" con y sin extensión. Un falso verde, que es peor que un test rojo.

Lo que sí funciona es **A/B sobre la misma zona**:

```
1. con la extensión de lenguaje instalada     → captura A
2. se desinstala, se recarga, mismo archivo   → captura B
3. se cuentan los píxeles que pasan de NEUTRO (texto gris/blanco) a VÍVIDO
```

Esos píxeles son, literalmente, los tokens que la extensión pintó. En el probe
del camino dinámico: **550 px neutros → vivos** (naranja de string, verde de
comentario, violeta de keyword) y ~1.500 cambios fuertes, sobre el mismo archivo
y el mismo rectángulo.

## 3. Herramientas

```bash
# Mapa de color en texto (letra por clase: R/Y/G/C/M, g = gris, . = fondo)
node tools/_look-png.mjs captura.png [columnas] [--bright] [--crop=x,y,w,h]

# Comparación A/B de dos capturas + qué colores cambiaron
node tools/_look-png.mjs antes.png despues.png [columnas]
```

`tools/lib/png-read.mjs` decodifica PNG (zlib + unfilter, sin dependencias) y
expone el helper `diffNeutralToVivid(before, after)` que usa el probe. El
decodificador está a mano porque el PNG de Electron es siempre el mismo caso
simple y no valía la pena una dependencia nativa por esto.

Uso típico desde un probe:

```js
const shot = await evaluate(ws, `window.api.screenshot.capture(${JSON.stringify({
  dir: '/tmp/innerta-shots', name: 'editor-con-extension', rect
})})`)
```

## 4. Ver el resultado

```bash
npm run build
node tools/_make-dynamic-sef.mjs <tree-sitter-javascript.wasm>
xvfb-run -a node tools/_probe-dynamic-app.mjs          # deja los PNG en /tmp/innerta-shots
node tools/_look-png.mjs /tmp/innerta-shots/editor-sin-extension.png \
                         /tmp/innerta-shots/editor-con-extension.png
```

El probe imprime además dónde quedaron las capturas, y el comando de la app deja
la suya en `~/Descargas/innerta-<fecha>.png`.
