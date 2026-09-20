/**
 * Namespace `contributes` — el lado VSIX de la tabla.
 *
 * Una entrada por contribution point conocido de VS Code. `kinds.ts` se DERIVA
 * de aquí (no hay segunda lista), así que cambiar el estado de un tipo es
 * cambiar UNA línea y el reporte de compatibilidad queda consistente.
 *
 * ── POR QUÉ ESTÁN *TODAS*, AUNQUE NO LAS SOPORTEMOS ─────────────────────
 *
 * Una key que no está en esta tabla se reporta como "contribution point
 * desconocido", y eso es peor que decir la verdad: `chatSkills` no es
 * desconocido, es una cosa que sabemos qué es y no soportamos. La diferencia
 * importa para el usuario que instala: "no sé qué es esto" vs "sé qué es y por
 * qué no funciona aquí".
 *
 * Route:
 *  - 'sef'  → hay traductor en `translators/registry.ts` (lo verifica un test).
 *  - 'host' → el código corre en el Extension Host.
 *  - 'none' → Scrakk no lo tiene: se reporta con el motivo.
 */

import type { SurfaceNamespace } from '../types'

export const contributesNamespace: SurfaceNamespace = {
  id: 'contributes',
  label: 'Aportes declarados por la extensión (package.json)',
  apis: [
    // ── Convertidos a SEF (traductor verificado por test) ─────────────────
    {
      key: 'themes',
      label: 'Temas de color',
      route: 'sef',
      status: 'real',
      native: 'themes'
    },
    {
      key: 'iconThemes',
      label: 'Temas de iconos de archivos',
      route: 'sef',
      status: 'real',
      native: 'fileIcons'
    },
    {
      key: 'productIconThemes',
      label: 'Temas de iconos de producto (UI)',
      route: 'sef',
      status: 'real',
      native: 'productIcons'
    },
    {
      key: 'viewsContainers',
      label: 'Contenedores de paneles (activity bar)',
      route: 'sef',
      status: 'real',
      native: 'views'
    },
    {
      key: 'views',
      label: 'Paneles de la activity bar',
      route: 'sef',
      status: 'real',
      native: 'views'
    },
    {
      key: 'viewsWelcome',
      label: 'Contenido de una vista vacía',
      route: 'sef',
      status: 'real',
      native: 'views',
      note: 'viaja dentro de la vista (`views[].welcome`): texto y botones de comando, con su `when`'
    },
    {
      key: 'languages',
      label: 'Definiciones de lenguaje',
      route: 'sef',
      status: 'real',
      native: 'languages',
      note: 'kit completo: asociación de archivos, `language-configuration.json`, iconos y defaults de editor'
    },

    // ── Convertidos a SEF, con una pieza que depende de otro sistema ──────
    {
      key: 'grammars',
      label: 'Gramáticas TextMate',
      route: 'sef',
      status: 'real',
      // `native` es el KIND SEF que la produce (el traductor de lenguajes junta
      // grammars + snippets + scopes en UNA contribución `languages`); el
      // detalle de dónde queda dentro del kit va en la nota.
      native: 'languages',
      note:
        'la gramática se copia al kit del lenguaje y el tokenizador la aplica al abrir o tipear (un lenguaje que el motor no tiene compilado igual se colorea); los tramos de LENGUAJE EMBEBIDO (JS dentro de HTML, código de Gleam dentro de markdown) todavía usan los scopes de la gramática padre'
    },
    {
      key: 'snippets',
      label: 'Snippets',
      route: 'sef',
      status: 'partial',
      native: 'languages',
      degradation: 'los archivos se guardan en el kit del lenguaje; la expansión en el editor todavía no está cableada'
    },
    {
      key: 'semanticTokenScopes',
      label: 'Mapeo tokenType → scope',
      route: 'sef',
      status: 'partial',
      native: 'languages',
      degradation:
        'el mapeo se guarda; se aplica cuando el language server manda semantic tokens (la leyenda del server ya los incluye)'
    },
    {
      key: 'configurationDefaults',
      label: 'Defaults de editor por lenguaje',
      route: 'sef',
      status: 'partial',
      native: 'languages',
      degradation:
        'los defaults `[lenguaje]` se guardan en el kit; los globales (sin lenguaje) todavía no se aplican a los ajustes'
    },
    {
      key: 'semanticTokenTypes',
      label: 'Tipos de token semántico propios',
      route: 'none',
      status: 'partial',
      degradation:
        'la leyenda la declara el language server en su `initialize`; los tipos propios no se importan por separado'
    },
    {
      key: 'semanticTokenModifiers',
      label: 'Modificadores de token semántico propios',
      route: 'none',
      status: 'partial',
      degradation:
        'igual que los tipos: la leyenda completa la declara el language server en su `initialize`'
    },

    // ── Código ────────────────────────────────────────────────────────────
    {
      key: 'code',
      label: 'Código de la extensión (main → Extension Host)',
      route: 'host',
      status: 'real',
      native: 'Extension Host',
      note: 'el entry se copia al paquete SEF y corre en su proceso; no aporta contribuciones SEF (las aporta views)'
    },
    {
      key: 'code.browser',
      label: 'Web extension (browser)',
      route: 'host',
      status: 'missing',
      degradation: 'el Extension Host todavía no ejecuta web extensions (`browser`)'
    },

    // ── Servicios de la plataforma ────────────────────────────────────────
    {
      key: 'commands',
      label: 'Comandos',
      route: 'host',
      status: 'partial',
      native: 'registro de comandos del IDE',
      degradation:
        'los comandos se registran en RUNTIME (ya puenteados al registry del IDE); la metadata declarada (títulos/categorías) todavía no se importa a la paleta'
    },
    {
      key: 'configuration',
      label: 'Configuración',
      route: 'host',
      status: 'partial',
      native: '@features/settings',
      degradation:
        'los defaults se leen en runtime, pero `getConfiguration().update()` todavía no persiste'
    },
    // ── Declarados y sin equivalente, con el motivo ───────────────────────
    {
      key: 'menus',
      label: 'Menús',
      route: 'none',
      status: 'missing',
      degradation: 'los menús/botones declarados en la titlebar todavía no se traducen'
    },
    {
      key: 'keybindings',
      label: 'Atajos de teclado',
      route: 'none',
      status: 'missing',
      degradation: 'sin sistema de keybindings contribuibles aún'
    },
    {
      key: 'debuggers',
      label: 'Depuradores',
      route: 'none',
      status: 'missing',
      degradation: 'sin subsistema de debug'
    },
    {
      key: 'breakpoints',
      label: 'Breakpoints por lenguaje',
      route: 'none',
      status: 'missing',
      degradation: 'sin subsistema de debug'
    },
    {
      key: 'debugVisualizers',
      label: 'Visualizadores de debug',
      route: 'none',
      status: 'missing',
      degradation: 'sin subsistema de debug'
    },
    {
      key: 'taskDefinitions',
      label: 'Tareas',
      route: 'none',
      status: 'missing',
      degradation: 'sin subsistema de tareas'
    },
    {
      key: 'problemMatchers',
      label: 'Problem matchers',
      route: 'none',
      status: 'missing',
      degradation: 'sin subsistema de tareas'
    },
    {
      key: 'problemPatterns',
      label: 'Problem patterns',
      route: 'none',
      status: 'missing',
      degradation: 'sin subsistema de tareas'
    },
    {
      key: 'terminal',
      label: 'Perfiles de terminal',
      route: 'none',
      status: 'missing',
      degradation: 'la terminal corre, pero todavía no acepta perfiles declarados por extensiones'
    },
    {
      key: 'terminalQuickFixes',
      label: 'Quick fixes de terminal',
      route: 'none',
      status: 'missing',
      degradation: 'sin integración de la terminal con diagnósticos'
    },
    {
      key: 'walkthroughs',
      label: 'Walkthroughs (primeros pasos)',
      route: 'none',
      status: 'missing',
      degradation: 'los pasos guiados todavía no se traducen al onboarding'
    },
    {
      key: 'colors',
      label: 'Colores nuevos del tema',
      route: 'none',
      status: 'missing',
      degradation: 'los `ThemeColor` propios no se pueden declarar desde la extensión'
    },
    {
      key: 'icons',
      label: 'Iconos propios (fuente)',
      route: 'none',
      status: 'missing',
      degradation: 'sin registro de fuentes de iconos de la extensión'
    },
    {
      key: 'jsonValidation',
      label: 'Validación de JSON/YAML',
      route: 'none',
      status: 'missing',
      degradation: 'sin validación por schema declarada'
    },
    {
      key: 'resourceLabelFormatters',
      label: 'Formato de etiquetas de archivo',
      route: 'none',
      status: 'missing',
      degradation: 'las etiquetas del explorer todavía no se formatean por extensión'
    },
    {
      key: 'submenus',
      label: 'Submenús',
      route: 'none',
      status: 'missing',
      degradation: 'depende del sistema de menús'
    },
    {
      key: 'statusBarItems',
      label: 'Items de la barra de estado',
      route: 'none',
      status: 'missing',
      degradation: 'los items se crean por API en runtime; los declarados no'
    },
    {
      key: 'localizations',
      label: 'Paquetes de idioma',
      route: 'none',
      status: 'missing',
      degradation: 'Scrakk todavía no carga bundles de traducción de extensiones'
    },
    {
      key: 'authentication',
      label: 'Proveedores de autenticación',
      route: 'none',
      status: 'missing',
      degradation: 'sin API de autenticación en el Extension Host'
    },
    {
      key: 'customEditors',
      label: 'Editores personalizados',
      route: 'none',
      status: 'missing',
      degradation: 'el IDE todavía no monta editores de extensión en una tab'
    },
    {
      key: 'notebooks',
      label: 'Notebooks',
      route: 'none',
      status: 'missing',
      degradation: 'sin subsistema de notebooks'
    },
    {
      key: 'notebookRenderer',
      label: 'Renderers de notebook',
      route: 'none',
      status: 'missing',
      degradation: 'sin subsistema de notebooks'
    },
    {
      key: 'notebookPreload',
      label: 'Preload de notebook',
      route: 'none',
      status: 'missing',
      degradation: 'sin subsistema de notebooks'
    },
    {
      key: 'typescriptServerPlugins',
      label: 'Plugins del servidor de TypeScript',
      route: 'none',
      status: 'missing',
      degradation: 'Scrakk consume el TS server como LSP; no inyecta plugins en su proceso'
    },
    {
      key: 'linkPresentationProviders',
      label: 'Presentación de links',
      route: 'none',
      status: 'missing',
      degradation: 'sin API de presentación de links en el editor'
    },
    {
      key: 'speechProviders',
      label: 'Proveedores de voz',
      route: 'none',
      status: 'missing',
      degradation: 'sin entrada de voz'
    },
    {
      key: 'remoteCodingAgents',
      label: 'Agentes de código remotos',
      route: 'none',
      status: 'missing',
      degradation: 'sin modo remoto'
    },
    {
      key: 'remoteHelp',
      label: 'Ayuda remota',
      route: 'none',
      status: 'missing',
      degradation: 'sin modo remoto'
    },
    {
      key: 'chatParticipants',
      label: 'Participantes de chat',
      route: 'none',
      status: 'missing',
      degradation: 'el chat de Scrakk no recibe participantes de extensiones todavía'
    },
    {
      key: 'chatAgents',
      label: 'Agentes de chat',
      route: 'none',
      status: 'missing',
      degradation: 'sin API de agentes de chat'
    },
    {
      key: 'chatInstructions',
      label: 'Instrucciones de chat',
      route: 'none',
      status: 'missing',
      degradation: 'sin API de instrucciones de chat'
    },
    {
      key: 'chatPromptFiles',
      label: 'Prompt files de chat',
      route: 'none',
      status: 'missing',
      degradation: 'sin API de prompts de chat'
    },
    {
      key: 'chatSkills',
      label: 'Skills de chat',
      route: 'none',
      status: 'missing',
      degradation: 'sin API de skills de chat'
    },
    {
      key: 'chatSessions',
      label: 'Sesiones de chat',
      route: 'none',
      status: 'missing',
      degradation: 'sin API de sesiones de chat'
    },
    {
      key: 'chatContext',
      label: 'Contexto de chat',
      route: 'none',
      status: 'missing',
      degradation: 'sin API de contexto de chat'
    },
    {
      key: 'chatViewsWelcome',
      label: 'Bienvenida de la vista de chat',
      route: 'none',
      status: 'missing',
      degradation: 'sin vista de chat contribuible'
    },
    {
      key: 'chatOutputRenderers',
      label: 'Renderers de salida de chat',
      route: 'none',
      status: 'missing',
      degradation: 'sin API de chat'
    },
    {
      key: 'chatPlugins',
      label: 'Plugins de chat (interno)',
      route: 'none',
      status: 'missing',
      degradation: 'punto de extensión interno de VS Code: no aplica a una extensión de terceros'
    },
    {
      key: 'languageModelTools',
      label: 'Tools de modelos de lenguaje',
      route: 'none',
      status: 'missing',
      degradation: 'sin API de herramientas para el modelo'
    },
    {
      key: 'languageModelToolSets',
      label: 'Conjuntos de tools del modelo',
      route: 'none',
      status: 'missing',
      degradation: 'sin API de herramientas para el modelo'
    },
    {
      key: 'languageModelChatProviders',
      label: 'Proveedores de modelos de chat',
      route: 'none',
      status: 'missing',
      degradation: 'Scrakk no expone un selector de modelos a las extensiones todavía'
    },
    {
      key: 'mcpServerDefinitionProviders',
      label: 'Servidores MCP',
      route: 'none',
      status: 'missing',
      degradation: 'sin soporte de MCP en el cliente de modelos'
    },
    {
      key: 'continueEditSession',
      label: 'Sesión de edición continua (interno)',
      route: 'none',
      status: 'missing',
      degradation: 'punto de extensión interno de VS Code: no aplica a una extensión de terceros'
    },
    {
      key: 'css',
      label: 'CSS (interno)',
      route: 'none',
      status: 'missing',
      degradation: 'punto de extensión interno de VS Code: no aplica a una extensión de terceros'
    },
    {
      key: 'jsonValidationRegistry',
      label: 'Registry de validación JSON (interno)',
      route: 'none',
      status: 'missing',
      degradation: 'punto de extensión interno de VS Code: no aplica a una extensión de terceros'
    }
  ]
}
