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
