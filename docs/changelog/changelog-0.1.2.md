---
title: "Changelog 0.1.2"
group: changelog
order: 20
summary: "Cambios relevantes de Scrakk Studio. La bienvenida muestra la primera entrada (la más nueva) en el apartado Anuncios, así que lo nuevo va arriba."
---
# Changelog

Cambios relevantes de Scrakk Studio. La **bienvenida** muestra la primera
entrada (la más nueva) en el apartado **Anuncios**, así que lo nuevo va arriba.

Formato: `## <versión> — <título>` y bullets por área. Las entradas ya
publicadas no se editan. El archivo va por versión:
`docs/changelog/changelog-<x.y.z>.md`.

---

## 0.1.2 — Memoria, terminal y chat

### Rendimiento (memoria del editor)
- El editor pasó de **un módulo WASM por archivo** a **uno por panel**: cada
  archivo abierto es una **sesión** dentro del mismo motor, con su estado
  completo (texto, **undo**, cursor, scroll y plegado). Cambiar de pestaña es
  instantáneo y **ya no se pierde el undo** (antes, al superar el tope de
  módulos en segundo plano, se descartaban). El motor ahora guarda ese estado
  por sesión.
- El renderer estaba **capeado a 256 MB** (`--js-flags` del perfil de
  producción, que se propaga a **todos** los procesos). Al abrir varios archivos
  V8 moría con *"Ineffective mark-compacts near heap limit"*. El tope queda
  **opt-in** y apagado por defecto (`SCRAKK_PERF_CAP_MAIN_HEAP=1` lo activa).
- Los cachés por archivo (símbolos del LSP, resaltado, encoding) ahora tienen
  **tope y descarte del más viejo**: antes crecían con cada archivo abierto
  hasta cerrar la tab.
- Cada panel tiene su **propio módulo** (aislado): se pueden tener **varios
  editores a la vez** (splits) sin que compartan canvas.

### Lenguajes (un solo camino)
- El **motor ya no trae gramáticas embebidas**: su wasm pasó de **~50 MB a ~3 MB**
  y queda como renderer (recibe tokens, plegado y selección del host).
- Cada lenguaje vive en **`langs/<id>/`** (su propio `.wasm` + queries + manifest)
  y el IDE los carga **on-demand**. Agregar o actualizar un lenguaje es regenerar
  su carpeta (`node tools/build-langs.mjs`), **sin recompilar el motor**.
- El pack `langs/` se registra como **una extensión** más, así que los lenguajes
  siguen funcionando sin instalar nada.
- **Queries por el sistema híbrido**: cada categoría se completa desde el catálogo
  que la publica mejor, no desde uno solo — **nvim-treesitter** (Apache-2.0) para
  `highlights`, `injections`, `locals`, `folds` e `indents`; **Helix** (MPL-2.0)
  para `tags` y `rainbows` (los únicos que los traen), y
  **nvim-treesitter-textobjects** (Apache-2.0) para `textobjects`. Cuando el repo
  del parser ya publica una categoría, esa manda. Cada catálogo va **fijado por
  commit** y su licencia queda grabada en el `grammar.json` del paquete.

### Editor — edición
- **Auto-pairing por lenguaje**: los pares de cierre los declara el lenguaje (su
  `language-configuration` o su tabla real); el motor ya no tiene una tabla fija
  ni heurísticas (se fue el caso especial del apóstrofe). Sin pares declarados no
  hay auto-cierre.
- **Auto-indent real**: la sangría de la línea nueva sale del `indents.scm` del
  lenguaje (`@indent.begin/@indent.end/@indent.dedent`) más la unidad del
  lenguaje. Se fue la heurística (sangría previa + `{`); sin dato del lenguaje se
  conserva la sangría actual.
- **Multi-cursor**: carets extra con `Ctrl+Alt+↑/↓`, `Alt+Click` (caret donde
  clickeás) y `Ctrl+D` (agrega la siguiente ocurrencia de la palabra, con
  envolvimiento); tipear, borrar y Enter se aplican en **todos**, las flechas los
  mueven juntos y `Esc` (o un click simple) vuelve a uno solo.

### Búsqueda (KolarGrep)
- La búsqueda en archivos ahora puede usar el **servidor de KolarGrep**
  (`kolargrep serve`) como **sidecar**: índice de trigramas **vivo** (watcher +
  overlay incremental), caché y resultados con **`spans`/`columns`** — que es lo
  que el editor necesita para resaltar el match exacto. El binario se lanza una
  vez por workspace, con el índice **fuera del proyecto**
  (`~/.cache/scrakk-search-serve`), y se apaga al cerrar la app.
- Se mantiene el **fallback** al addon nativo y, si no está, al scan en TS: sin
  sidecar la búsqueda sigue funcionando (solo pierde los detalles finos).

### Editor — sugerencias (LSP)
- **Lista de sugerencias en tiempo real** anclada al caret, como VS Code: al
  tipear se pide `textDocument/completion` al server del archivo y aparece el
  menú (DOM puro, igual que el tooltip del hover y el menú contextual). `↑`/`↓`
  eligen, `Enter`/`Tab` aceptan, `Esc` cierra, `Ctrl+Space` la abre a mano y el
  click también acepta.
- Filtra por el **prefijo tipeado**, ordena por `sortText` y **deduplica** el
  mismo símbolo cuando lo proponen dos servers. Cada ítem lleva **badge por
  tipo**, `detail` y panel de **documentación**.
- El commit **conserva el undo**: en vez de reescribir el buffer, manda los
  Backspace del prefijo y los caracteres por el camino de teclado del motor (así
  además respetan los auto-pairs del lenguaje).
- El **ancla del caret** se calcula del lado del host (hit-test inverso sobre el
  motor), así que no hizo falta ningún canal nuevo en Innerta.
- Límites de esta primera versión: sin **snippets** ni **auto-import**
  (`additionalTextEdits`), filtro por prefijo (no fuzzy) y el commit con
  **multi-cursor** activo todavía toca todos los carets.

### Terminal
- Al **cambiar de workspace**, las terminales abiertas se reubican en el
  proyecto nuevo (`cd`) y las nuevas nacen en la carpeta correcta. Antes
  quedaban en la carpeta del proyecto anterior.

### Chat de IA
- Se quitó el **tope de rondas de tools** por turno (era 12): el ciclo se cortaba
  en silencio después de varias herramientas. Ahora solo lo corta el usuario con
  **Detener**.

### Panel de Git (UI)
- **Rediseño del panel**: la rama y los botones **Fetch / Pull / Push** ahora
  viven en un **solo bloque sin bordes**, solo con fondo; antes eran dos filas
  con caja. Si hay varios repos, el activo aparece como etiqueta.
- **Jerarquía reordenada**: el **mensaje de commit sube arriba de los cambios**
  (antes quedaba escondido al final) y las secciones se agrupan por zonas:
  **Repositorio** (ramas, historial, stash, tags, remotos), **Integración**
  (cuenta, pull requests) y **Workspace** (árbol de solo lectura, que pasa al
  final por no ser git).
- **Historial con línea de tiempo**: un raíl continuo conecta los puntos de cada
  commit.
- **Tipografía más calmada**: fuera las MAYÚSCULAS de los títulos y pesos
  bajados a 400/500, con números tabulares.
- **Botones cuadrados** con esquinas redondeadas (ya no cápsula), también en el
  commit.
- El **input de commit** queda idéntico al del chat de IA: sin resize, con el
  borde que aparece al enfocar y los botones alineados a la derecha.
- **Hover directo**, sin transiciones, para que el cursor responda al instante.

### Layout (splits)
- Los paneles ahora se **parten de verdad**: al soltar una tab en un borde
  (arriba / abajo / izquierda / derecha) se crea un **grupo nuevo** con su
  propia barra de tabs, como en VS Code. Se pueden **anidar** sin límite.
- El separador entre grupos muestra **dos bordes** (uno por hoja, mismo estilo
  que el resto de paneles) con el handle de resize en el medio, igual que la
  separación entre slots.
- Cada split guarda su **ratio**: el tamaño se conserva al recargar la app.
- Los splits viejos de **contenido dividido** (`splitDir`) se migran solos a
  grupos reales al abrir la app.
- Un grupo **vacío** muestra un botón **Cerrar slot** que lo cierra (colapsa
  el split al grupo hermano o cierra el slot entero).

### Barra de estado (UI)
- Se **unificó el hover** de todos los botones/chips: cuadrado con esquinas
  redondeadas (radio chico, no cápsula), mismo alto y color `--color-hover`,
  tanto en los de la izquierda (LSP, problemas, git, encoding, extensiones)
  como en los de la derecha (toggles de paneles, notificaciones y ajustes).

### Cuenta (UI)
- El **código de verificación por email** ahora se escribe en un input con
  **slots animados** (`CodeSlots`, de React Bits): los dígitos aterrizan uno a
  uno, el error **drena y limpia** los slots y el acierto los funde con un
  check. Verifica solo al completar los 6 dígitos.

### Chat de IA (UI)
- El selector de **esfuerzo de pensamiento** abre una **barra slideable**
  (extraída del componente PromptBar) en un menú custom, en vez del menú
  contextual de opciones. Al llegar al **paso máximo**, el input se enciende con
  un wash de acento y **chispas** que suben (más intensas al tipear).

### Chat de IA — Skills (UI)
- Las **vistas de skills e historial** dejaron de ser un toggle: son vistas
  propias dentro del panel de chat, cada una con su **botón de volver** (animado)
  en el header y su título propio (**Skills** / **Historial**). Abrir una cierra
  la otra desde cualquier vía (header, comando o menú).
- **La pestaña sigue el título del panel**: al mover el chat a otra zona, la tab
  toma el título dinámico que el panel publica (p. ej. **Skills**) en vez de un
  label fijo.
- **Rediseño del panel de Skills**: barra de acciones arriba (**Nueva** con
  icono y **Recargar**, que pasa a **Cerrar** al abrir el formulario); el
  formulario aparece debajo al pulsar **Nueva** y la lista queda abajo. El
  formulario y el log se **colapsan/expanden animando la altura**, así el
  contenido se mueve suave y sin saltos; la entrada de los campos es
  **escalonada (350ms)** y la salida inversa de **150ms**.
- **Filas estilo explorador**: píldora de origen más grande (envuelve si el
  texto es largo) y hover de fila que contiene los botones de acción. Los inputs
  viven sobre un container con la **superficie del tema** y usan el **bg del
  tema** (nada hardcodeado), sin bordes y sin resize en las instrucciones.
- **Contador** en lenguaje natural ("Tienes N skills") y **confirmación al
  borrar** mediante el **sistema global de modales**.

### Herramientas (tipos)
- Las tools se agrupan por **Familias → Tipos** en Ajustes → Chat →
  Herramientas: **Entorno** (Archivos, Código, Sistema, Navegador, Skills,
  Utilidades) y **Agénticos** (Subagentes).
- Cada tool declara su `type`; ya **no hay un union hardcodeado**. El catálogo
  es **extensible**: una extensión `.sef` puede aportar su propio
  **pack/familia** y sus tipos (`family`/`type` en el manifest).
- Toggle por **grupo** (encender/apagar todo un tipo) además del toggle por tool.
- La **guía propia de cada tool** (`prompt.ts`) ahora se inyecta al system prompt
  (`Guidance:` por tool). Antes estaba muerta: solo se usaba la `description`.

### Agentes (UI)
- Se **unificaron modos y subagentes** en un solo concepto: **Agentes**, con
  dos tabs en Ajustes → Chat → **Agentes**: **Primarios** (los que antes eran
  "modos", el agente activo del chat) y **Subagentes** (reusables).
- Cada agente tiene **prompt, permisos, herramientas y modelo** propios; el
  modelo **hereda el del chat** por defecto (`inherit`, como el CLI).
- Los subagentes se invocan con la tool **`task`** o escribiendo
  **`@nombre <tarea>`** en el input del chat. Los primarios declaran qué
  subagentes pueden usar (los modos integrados ven todos).
- Se guardan en `.scrakk/agents/primary.json` y `.scrakk/agents/subagents.json`
  (usuario y proyecto). Al primer arranque se crea un primario **Asistente** y
  un subagente **Explorador** (read-only) usando el propio sistema, no builtins.
- `modes.json` se migra solo a `primary.json`.
- **El subagente se ve en un modal**: `@nombre <tarea>` (y el click en la card
  de `task`) abre un **modal sin overlay** (variante `plain` del sistema global
  de modales) montado **dentro del panel de chat**, con el **transcript en vivo**
  del subagente (contenido, razonamiento y tool calls) reusando los componentes
  de chat, **sin input** (un subagente no recibe mensajes). Mientras está
  abierto, el input del chat principal queda **bloqueado** (estado `locked`).
- Las **tool calls** llegan **en vivo**: el proceso main las emite mientras el
  modelo las escribe (antes solo al terminar el stream), así la card aparece en
  tiempo real y no recién al cortar la respuesta.
- La tool `task` tiene **card custom** (shimmer mientras corre): al terminar,
  **click en la card** abre ese modal; solo hay uno a la vez.

### Servidores (LSP)
- **Progreso de instalación en vivo**: al instalar un language server desde
  Ajustes, el botón que dispara la acción se envuelve con un **borde animado**
  que recorre sus cuatro lados mientras corre, y el **tooltip** muestra la fase
  (preparando, descargando, instalando, extrayendo). Cuando el release publica
  `content-length`, además se ve el **porcentaje real** (`Descargando… 42%`).
- La descarga de releases de GitHub se **transmite por chunks** y reporta
  bytes/porcentaje desde el proceso main; antes se bajaba el buffer completo en
  memoria y sin aviso. Los instaladores por **npm/go/gem/dotnet** muestran su
  última línea de salida, sin inventar un porcentaje que no conocen.
- **Feedback unificado en la zona**: reiniciar, encender/apagar e instalar usan
  el mismo botón de carga; la carga inicial de la lista usa la barra de la zona.
  Cada operación permanece visible **al menos 250 ms** aunque responda al
  instante (evita el parpadeo) y el aviso del resultado sale después de ese
  mínimo.
- El botón de carga queda como **pieza reutilizable del UI kit**
  (`LoadingButton`, con variantes y tamaños como `IconButton`), disponible para
  cualquier botón de la app y con el color del tema.

### Ajustes (UI)
- **Botón "volver arriba"** en el contenido de Ajustes: aparece al bajar con una
  animación de **150ms** (fade + deslizamiento) y sube el contenido de forma
  **suave**; respeta `prefers-reduced-motion` (salto directo) y al cambiar de
  sección el contenido vuelve arriba.

### Correcciones
- **Emoji: ancho de 2 celdas y nítidos**: el layout era `x = columna × ancho`
  puro, así que un emoji avanzaba **una** celda y se pisaba con el vecino (y el
  caret quedaba mal). Ahora el layout es **consciente del ancho** (emoji del
  plano suplementario y CJK ancho = 2 celdas; ZWJ/selectores/combinantes = 0) y
  el caret, el hit-test, los rangos y el ancho de la línea lo respetan. Además
  el bitmap de color se carga a **3× y se baja con filtro lineal**: se acabó el
  emoji borroso.
- **Emojis en color (los del sistema)**: el motor no puede sacarlos de FreeType
  en WASM (los emoji del sistema son bitmaps de color y su strike es de 136 px),
  así que los **rasteriza el host** con el navegador (Noto Color Emoji / Apple
  Color Emoji / Segoe UI Emoji) y el motor los pinta como un glifo provisto por
  el host — el mismo reparto que tokens, subrayados o indentación. Si el canvas
  no dibuja nada, no se empuja: queda el respaldo monocromo embebido.
- **Emojis y símbolos no se veían**: la cadena de fuentes de respaldo del motor
  apuntaba a rutas del sistema, que **no existen en el build web**, así que
  quedaba vacía y todo lo que la fuente del editor no tiene (símbolos, emoji del
  plano suplementario) se dibujaba con avance 0. Ahora se **embeben** dos fuentes
  recortadas (símbolos BMP y emoji astral) y el atlas las usa como respaldo:
  `😀 🚀 👍 ❤ ✔ ⚠` y los dibujos de caja se ven.
- **Editor en varios paneles**: al abrir un archivo en un segundo panel, el
  editor quedaba **vacío** porque los paneles compartían un único módulo WASM y
  canvas. Ahora **cada panel monta su motor aislado**.
- **Mover una tab de archivo entre paneles**: el motor podía quedarse **sin
  cargar** (la espera del módulo no se resolvía nunca y el panel de origen
  acumulaba motores). Ahora la espera termina siempre y el panel que queda
  **vacío libera su motor** (WASM + contexto GL).
- **Bienvenida → Consejos**: el indicador de puntos (que marca en qué consejo
  vas) se aplastaba y quedaba **superpuesto** cuando el panel no tenía ancho.
  Ahora no se encoge, baja de línea si hace falta y, si sigue sin caber, se
  **resume a `n/total`**.
- **Bienvenida → Acciones**: en paneles muy angostos, las 3 tarjetas de arriba
  (*Nuevo archivo*, *Abrir archivo*, *Abrir carpeta*) pasan a **texto simple**,
  sin ícono ni tarjeta, con el atajo alineado a la derecha.
- **Chat de IA**: los **iconos de las tools** ahora usan el mismo color que el
  texto de la tool (`--color-text-muted`); antes heredaban el color del chat y
  se veían más brillantes.
- **Explorer**: el input de **renombrar/crear** archivo ya no usa el borde de
  acento ni un radio grande; ahora **no tiene borde** (solo fondo), radio chico
  y sin contorno. Su texto (y el placeholder) usa el tamaño de las filas
  (`--text-xs`, 12px); antes el de crear heredaba un tamaño mayor.
- **Breadcrumb, tab activa y editor (Innerta)**: los tres usan el mismo fondo
  que las activity bars (`--activitybar-bg`/surface): el breadcrumb dejó de ser
  transparente, la tab activa dejó el tinte de hover y el buffer del editor
  ahora matchea el chrome.
- **Bienvenida → Anuncios**: el punto de "novedades" ahora también detecta el
  **changelog local**: si el `changelog-x.x.x.md` más nuevo supera la versión de
  la app, aparece el badge (sin depender del release remoto), y al abrir
  Anuncios queda como visto.
- **Tabs**: el strip scrollea en horizontal con la **rueda** del mouse cuando
  las tabs desbordan (antes solo con trackpad o Shift+rueda).
- **Tabs / layout**: se corrigió un loop de updates (*"Maximum update depth
  exceeded"*) al montar **muchos paneles**: el ref combinado del strip cambiaba
  de identidad en cada render y React hacía detach/attach llamando `setState`
  en bucle. Ahora es estable.
- **Desarrollo — hot reload (Vite HMR)**: en casos aislados, un *full reload* del
  dev server (por ejemplo al reconstruirse el preload o al re-optimizar
  dependencias) abría el proyecto en el **navegador del sistema** con
  `localhost` y dejaba la ventana de la app **congelada**. El handler global de
  `will-navigate` mandaba a `openExternal` hasta la URL del propio dev server;
  ahora las navegaciones al dev server (reload de HMR y links internos) se
  resuelven **dentro** de la ventana y solo las URLs externas salen al navegador.
- **Ajustes → Chat → Proveedores**: los iconos de la lista quedaban **pegados
  arriba** (más aire abajo que arriba); ahora van **centrados**. Además los
  **logos de models.dev** se pintan como **silueta con el color del tema**
  (antes el `<img>` no heredaba el color y salían negros), con el mismo patrón
  de máscara que el logo de la bienvenida.
