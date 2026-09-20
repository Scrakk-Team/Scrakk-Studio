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
- Título del panel **`Chat: <nombre>`**, actualizado por la tool de título.
- El texto de las tool cards **no se puede seleccionar**.
- Iconos de tools centrados.
- Fila de controles **responsive**: al angostar el panel, **skills**,
  **pensamiento** y **modelo** se ocultan del centro hacia afuera y quedan en un
  **botón de 3 puntos** (⋯); el modo permanece visible.
- La etiqueta del **modo** es clickeable y abre el menú con todos los modos
  (integrados y propios).

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

### Varios
- Pase de textos y comentarios a **español neutro** en todo el repo.
