# Changelog

Cambios relevantes de Scrakk Studio. El editor renderiza la **primera entrada
(la más nueva)** en un modal, así que lo nuevo va arriba.

Formato: `## <versión> — <título>` y bullets por área. Las entradas ya
publicadas no se editan.

---

## Unreleased — Chat con IA: más control

### Comandos con barra (`/comando`)
- **API global de comandos** (`services/slash-commands`): registra, lista y
  ejecuta comandos desde cualquier input; cada comando lleva su lógica en su
  propia carpeta.
- El chat con IA tiene su carpeta de comandos (`features/chat/commands/`), con
  la funcionalidad separada en `logic.ts` (mismo patrón que las tools).
- **`/variants`**: elige el effort/variante de razonamiento del modelo activo.
  Sin argumento abre un selector; con argumento aplica directo; `auto` limpia.
- Un comando puede mostrar **su propia UI** (modal/menú) y pedir que el chat no
  agregue un mensaje de texto.
- **Autocompletado**: al escribir `/` aparece un panel flotante arriba del input
  con los comandos disponibles.

### Skills (estándar Agent Skills)
- Sistema de skills: carpetas con `SKILL.md` (frontmatter `name` +
  `description`) en `.scrakk/skills` (proyecto y usuario).
- Instalación/borrado reales desde la app (escribe `SKILL.md` en disco).
- **Dos tools nuevas**: `list_skills` (lista las disponibles) y `skill` (carga
  el cuerpo de una por nombre, con divulgación progresiva).
- El parser de `SKILL.md` resuelve **escalares de bloque YAML** (`>` plegado y
  `|` literal, con chomping `-`/`+`), así las descripciones multilínea se leen
  bien y las skills se autodisparan.
- **Vista de skills dentro del chat** (reemplaza el contenido, como el
  historial) y botón **`skills: N`** debajo del input.
- **API pública del chat** para insertar contenido/skills desde cualquier panel
  o extensión.
- Los `.sef` pueden empaquetar skills (tipo de extensión `skills`).

### Tool nueva
- **`web_search`**: busca en la web (query + dominios permitidos) y devuelve
  título, URL y snippet.
- **`web_fetch`**: trae una URL y la devuelve como markdown, con protección
  SSRF (bloquea rangos privados, link-local y metadata) y recorte de páginas
  largas.
- Corren en el proceso main (sin CORS).

### Ajustes → Chat
- **Sección Chat** nueva, con hijos:
  - **Proveedores** (reemplaza al modal de proveedores).
  - **Herramientas**: activa/desactiva cada tool.
  - **Skills**: activa/desactiva cada skill.
  - **Modos**: crea modos propios y elige qué herramientas tiene cada uno.
  - **Permisos**: reglas de permitir/preguntar/negar, en todos o en ciertos
    modos.
- Las tools deshabilitadas **no llegan al modelo**: no aparecen ni en el prompt
  ni en el request.
- Los selectores de los apartados usan el **menú contextual global** de la app
  (nada de `<select>` nativo) con el chevron de proicons.

### Proveedores (models.dev)
- Se eliminó la lista de proveedores hardcodeada y ahora el catálogo sale de
  **models.dev**, con refresh **en cada apertura** y cache en disco.
- Incluye modelos reales, **logos**, costos/límites y metadata de razonamiento.
- El campo de modelo sugiere los ids del catálogo.
- Fix de DeepSeek: modelo por defecto `deepseek-flash` y variantes válidas.

### Chat con IA (UI)
- El **selector de modelo** y el **modo** se movieron debajo del input, junto al
  botón `skills: N`.
- **Botón de variante** de razonamiento al lado del selector de modelos (misma
  pinta y chevron); abre un menú con las variantes del modelo provistas por
  models.dev.
- La **confirmación de tools** dejó de ser un modal centrado: ahora es un panel
  anclado **arriba del input**, sin el JSON de argumentos (solo motivo, riesgo y
  detalles). Esc o click afuera rechaza.
- **Selector de comandos** (`/`): panel flotante arriba del input, más ancho y
  con cada comando en una línea.
- Las tool calls se muestran **después** del texto (orden real del stream).
- Los mensajes con **tool calls** ya no muestran la barra de **copiar** /
  **regenerar**: solo aparece en la respuesta final de texto.
- Título del panel **`Chat: <nombre>`**, actualizado por la tool de título.
- El texto de las tool cards **no se puede seleccionar**.
- Iconos de tools centrados.
- Fila de controles **responsive**: al angostar el panel, **skills**,
  **pensamiento** y **modelo** se ocultan del centro hacia afuera y quedan en un
  **botón de 3 puntos** (⋯); el modo permanece visible.
- La etiqueta del **modo** es clickeable y abre el menú con todos los modos
  (integrados y propios).

### Notificaciones
- El botón de cerrar usa el ícono **X de proicons** con hover **cuadrado de
  esquinas redondeadas** (no circular).
- La **raya inferior** es dinámica por severidad (rojo error, ámbar warning,
  verde éxito, acento info) y se **vacía según el tiempo restante** antes de
  cerrarse sola.
- **Tiempo custom** por notificación (`timeoutMs`; `0` = persistente) con
  defaults por severidad (info/success 6s, warn 8s, error 10s). Las
  notificaciones del **LSP** ahora traen su tiempo explícito.

### Permisos
- **Modos del CLI**: `default`, `plan`, `acceptEdits`, `auto`, `dontAsk` y
  `bypassPermissions` (con alias `auto_edit`/`all_allow`), cada uno con sus
  efectos: `acceptEdits` autoaprueba ediciones, `bypassPermissions` aprueba
  todo, `dontAsk` niega en vez de preguntar y `plan` es de solo lectura.
- **Modos propios**: se crean desde Ajustes → Chat → Modos partiendo de un modo
  integrado y ajustando ediciones, shell, confirmaciones y **qué herramientas
  quedan habilitadas en cada modo**. Se guardan en `.scrakk/modes.json`.
- **Reglas acotadas por modo**: una regla puede aplicar solo a ciertos modos
  (p. ej. negar `git push` únicamente en Plan), además de las globales.
- **Reglas de permisos** con la DSL del CLI/Claude: `Bash(npm run *)`,
  `Bash(git push:*)`, `Read(src/**)`, `Edit(**)`, `Grep(**/.env)`,
  `WebFetch(domain:example.com)`, `WebSearch`, `MCPTool(...)` y tool sin
  paréntesis.
- Precedencia **deny > ask > allow**, globs de path (`*` no cruza `/`, `**`
  sí), matcheo por dominio y reglas de `Read` que también gobiernan `Grep`.
- Se cargan desde **`.scrakk/permissions.json`** (proyecto y usuario, gana el
  proyecto) con `permissions.allow/ask/deny/defaultMode`.
- **Pantalla de Permisos** en Ajustes → Chat: edita las listas permitir /
  preguntar / negar con su alcance de modos y el modo inicial, y lo aplica al
  instante.
- El modo **`auto`** corre con fast-paths determinísticos (lecturas y
  ediciones se aprueban, comandos de shell rutinarios como `ls`, `git status`,
  `npm test`; lo dudoso pide confirmación). El clasificador por LLM queda
  pendiente.

### Streaming
- Se reemplazó el timeout **total** de 3 minutos (cortaba generaciones largas)
  por un timeout de **inactividad** de 2 minutos + uno de conexión.
- Mensajes de error específicos: inactividad, conexión, o corte del usuario.

### Rendimiento (que un panel lento no trabe todo)
- **Stream agrupado por frame**: el chat deja de re-renderizar por token; los
  deltas se juntan y se aplican como máximo una vez por frame.
- **Sin markdown durante el stream**: mientras la IA escribe se muestra texto
  plano y el markdown se parsea una sola vez al cerrar la ronda (el parseo con
  Prism era lo más caro).
- **Lista de mensajes** con `content-visibility`: los mensajes fuera de pantalla
  no se pintan.
- **Persistencia a idle**: el historial se serializa cuando el hilo está libre,
  no durante el stream.
- **Perfil de paneles**: cada panel se mide (React Profiler); si se mantiene
  lento, se le pausan las animaciones (`data-panel-slow`) y se recupera solo.
- **Cambiar de chat** es una transición: el click responde al instante aunque
  el historial de la sesión sea grande.

### Mensajes directos (chat social)
- **Carga por scroll**: al abrir un chat se trae la última página y las
  anteriores se piden **solo al subir a mano** (antes se encadenaban hasta
  agotar todo el historial).
- **Posición al abrir**: va al **último mensaje**; si saliste hace poco y
  estabas leyendo más arriba, vuelve a esa zona (memoria de scroll por
  conversación, 10 minutos).
- Los mensajes **fuera de pantalla no se pintan** (`content-visibility`).
- Abrir un chat limpia el anterior al instante y muestra el placeholder de
  carga, en vez de dejar los mensajes del amigo previo.

### Arrastrar archivos y carpetas a tabs
- Los archivos y carpetas del **explorador** se pueden soltar en cualquier zona
  de tabs (el sistema de drag de tabs y el nativo del explorador ahora
  conviven): un archivo se abre como **tab en la zona donde se suelta**, y una
  carpeta crea una **tab de explorador** sobre esa carpeta.
- Usa el **mismo indicador** (la rayita) que el drag de tabs.
- El drag interno del explorador (mover archivos a una carpeta) sigue igual.

### Chat social — emojis, slowmode y contador
- **Selector de emojis** en el composer (búsqueda, categorías y recientes); un
  mensaje que es **solo emojis** se agranda.
- **Slowmode** estilo Discord: 5 mensajes / 5 s con una frase simpática al
  pasarse; en la base queda un backstop más holgado
  (`docs/backend/0018_message_rate_limit.sql`).
- **Contador** en el botón Social de la ActivityBar (no leídos + solicitudes).

### Editor — ir a la definición
- **Ctrl/Cmd + hover** subraya el símbolo con una línea plana (mismo sistema de
  decoraciones) **al instante** (sin timers); **Ctrl/Cmd + click** lleva a la
  definición.
- Resolución en capas: `locals.scm` → `tags.scm` (clases/funciones) → **símbolos
  del LSP** (prefetcheados una vez por archivo, para que el subrayado sea
  síncrono) → `textDocument/definition` (solo si hace falta, y para el click).
- **Cursor** del editor: **I-beam** sobre el texto y **flecha** sobre el gutter
  (números, chevrons, bookmark); con Ctrl sobre un símbolo resoluble pasa a
  **manita**. El motor expone `GetInnertaTextXOffset()` (nuevo export del WASM)
  para saber dónde arranca el texto.
- Se quitó **“Ir a definición”** del menú contextual del editor; **F12** sigue.

### Editor — nuevos lenguajes
- **Gramáticas nuevas embebidas en el motor**: **Prisma**, **HCL**,
  **Terraform** (dialecto propio, no el de HCL), **CMake**, **Svelte**, **SCSS**
  y **Less**, cada una con sus queries (resaltado, plegado, indentación e
  inyecciones; Svelte además con `locals`).
- La detección de archivos ya no manda `.scss` y `.less` al CSS genérico: cada
  uno usa su gramática.
- Los servidores LSP que ya existían siguen aplicando (Terraform, CMake, Svelte,
  Prisma; el de CSS cubre SCSS/LESS).

### Extensiones
- Tipo **`tools`**: herramientas de IA aportadas por un `.sef`, con su carpeta
  `visual/` y ejecución por comando en el Extension Host.
- Tipo **`skills`**: packs de skills dentro de un `.sef`.
- Documentación: `docs/chat/slash-commands.md`, `docs/chat/permissions.md`,
  `docs/extensions/tools.md`, `docs/extensions/skills.md`.

### API de `.scrakk`
- API global de la carpeta `.scrakk` (usuario y proyecto): listar, leer,
  escribir, borrar, crear y vigilar archivos, enjaulada a la raíz.
- La usan las skills y queda disponible para lo que venga.

### Deshabilitado
- Se retiraron las tools web viejas (`open_browser`, `view_web`,
  `list_browser_tabs`, `navigate_web`): no funcionaban bien.

### Correcciones
- **Eliminar archivos**: el modal de confirmación se quedaba en "Eliminando…"
  al borrar un segundo archivo (el estado `busy` sobrevivía entre aperturas) y
  no dejaba cerrarlo. Ahora se monta por apertura y los errores de borrado se
  muestran en el modal.
- **Chat social**: no se podía seleccionar el texto de los mensajes. Ahora se
  puede seleccionar y copiar (el resto de la UI sigue sin selección).
- **Social / Realtime**: con el token vencido (por ejemplo, tras dejar la app
  abierta horas), el canal se reconectaba cada 3s sin backoff: la terminal se
  llenaba de errores de JWT y el panel parpadeaba. Ahora reconecta con
  **backoff** (2s → 30s), limpia los canales al recrear, descarta el cliente con
  sesión inválida para reconstruirlo, y el panel agrupa los refrescos de
  Realtime en vez de recargar ante cada evento.
- **GPU Intel vieja en Linux**: la app lo detecta sola (generación leída de
  `/sys`) y, en Gen7 o anterior, usa el driver VA-API correcto (**i965**) y
  evita **Vulkan** (que no existe en esa generación). En GPUs modernas no cambia
  nada (no se pierde rendimiento).
- **Contenido que parpadea o se congela en KDE Wayland**: es un bug de **KWin**
  (buffer ring / explicit sync; KDE #506731 y #510747) que afecta a **toda** app
  Chromium/Electron (Firefox no). En KDE + Wayland la app corre por **XWayland**
  (`--ozone-platform=x11`) para esquivarlo; se desactiva con
  `SCRAKK_PERF_KDE_X11=0`.

### Varios
- Pase de textos y comentarios a **español neutro** en todo el repo.
