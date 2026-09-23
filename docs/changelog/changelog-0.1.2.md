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

### Correcciones
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
  y sin contorno.
- **Breadcrumb, tab activa y editor (Innerta)**: los tres usan el mismo fondo
  que las activity bars (`--activitybar-bg`/surface): el breadcrumb dejó de ser
  transparente, la tab activa dejó el tinte de hover y el buffer del editor
  ahora matchea el chrome.
