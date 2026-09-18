/**
 * COMANDOS BUILT-IN de VS Code → acciones nativas de Scrakk.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTA TABLA
 *
 * Una extensión no sólo usa el API: también PIDE comandos del entorno. Los
 * tres casos que más se ven en extensiones reales (medidos sobre el bundle
 * instalado de Cline):
 *
 *   workbench.action.reloadWindow      ×5   "Reiniciar el IDE"
 *   workbench.action.terminal.*        ×8   copiar/seleccionar la terminal
 *   workbench.action.openSettings      ×2   "Open Settings" (¡el botón de la
 *   workbench.action.openWalkthrough   ×4   notificación de la captura!)
 *   workbench.action.closePanel        ×2
 *   vscode.open / vscode.diff / …      ×7
 *
 * Sin esta tabla, cada uno de esos botones terminaba en un
 * `el IDE no tiene el comando "…"`: la extensión hacía lo correcto, el IDE no
 * tenía el equivalente, y el usuario veía un error en vez de una acción.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REGLAS (las mismas de la tabla de superficie)
 *
 *  - `handler` → la capa de compatibilidad lo ejecuta con una acción nativa
 *    (y recibe los ARGS del comando, que es lo que hace útil a `vscode.open`).
 *  - `native`  → ya existe un comando del IDE que hace exactamente esto: se
 *    delega. No se duplica en la paleta.
 *  - sin ruta → `degradation` OBLIGATORIA: dice qué ve la extensión en su
 *    lugar. Nunca un no-op silencioso.
 *
 * Este archivo es DATA (no importa servicios ni React): lo consume el
 * ejecutor del renderer y lo puede leer cualquier reporte de compatibilidad.
 */

/** Acción nativa que implementa el renderer (con los args del comando). */
export type BuiltinHandlerKey =
  /** Abre Ajustes; con `@ext:pub.nombre` entra a la sección de extensiones. */
  | 'settings.open'
  /** Recarga la ventana del IDE (equivalente a `reloadWindow`). */
  | 'window.reload'
  /** Abre/enfoca una terminal. */
  | 'terminal.focus'
  /** Crea una terminal NUEVA (no reutiliza la existente). */
  | 'terminal.new'
  /** Cierra el panel activo (terminal o panel de extensión). */
  | 'panel.close'
  /** Abre el panel de un contenedor de extensión (actividad `workbench.view.extension`). */
  | 'view.container.reveal'
  /** Abre una URI en el editor. */
  | 'file.open'
  /** Igual que `file.open` (se ignora el editor pedido, si vino). */
  | 'file.openWith'
  /** Abre una carpeta como raíz del workspace. */
  | 'folder.open'
  /** Guarda TODOS los archivos abiertos. */
  | 'file.saveAll'

export interface BuiltinCommandEntry {
  /** Id tal cual lo usa VS Code (`workbench.action.…`, `vscode.…`). */
  id: string
  /** Nombre humano (lo ve el usuario en la paleta y en los errores). */
  label: string
  /** Acción de la capa de compatibilidad. */
  handler?: BuiltinHandlerKey
  /** Comando NATIVO del IDE que ya hace esto (se delega tal cual). */
  native?: string
  /** Qué pasa cuando no hay ruta. Obligatorio si no hay handler ni native. */
  degradation?: string
  /**
   * ¿Se lista en la paleta? Los que delegan en un comando nativo ya están
   * listados por ese comando: duplicarlos sería ruido, no compatibilidad.
   */
  palette?: boolean
  /** Detalle técnico (por qué no hay ruta, qué se ignora, etc.). */
  note?: string
}

/**
 * Tabla. El orden es el de uso real medido en extensiones de paneles.
 */
export const BUILTIN_VSCODE_COMMANDS: BuiltinCommandEntry[] = [
  // ── Ciclo de vida de la ventana ─────────────────────────────────────────
  {
    id: 'workbench.action.reloadWindow',
    label: 'Reiniciar la ventana',
    handler: 'window.reload',
    palette: true,
    note: 'recarga el renderer: el shell y los hosts de extensión vuelven a arrancar'
  },
  {
    id: 'workbench.action.openSettings',
    label: 'Abrir ajustes',
    handler: 'settings.open',
    palette: true,
    note: 'un arg `@ext:pub.nombre` entra directo a la sección de extensiones'
  },
  {
    id: 'workbench.action.openWalkthrough',
    label: 'Abrir la guía de inicio',
    native: 'onboarding.open',
    note: 'la guía de Scrakk es la configuración inicial'
  },
  {
    id: 'workbench.action.showCommands',
    label: 'Paleta de comandos',
    native: 'palette.open'
  },

  // ── Paneles y terminal ──────────────────────────────────────────────────
  {
    id: 'workbench.action.closePanel',
    label: 'Cerrar el panel activo',
    handler: 'panel.close',
    palette: true
  },
  {
    id: 'workbench.action.terminal.focus',
    label: 'Enfocar la terminal',
    handler: 'terminal.focus',
    palette: true
  },
  {
    id: 'workbench.action.terminal.toggleTerminal',
    label: 'Mostrar/ocultar la terminal',
    handler: 'terminal.focus',
    note: 'el toggle real vive en el IDE; acá enfoca (abrir una terminal ya la muestra)'
  },
  {
    id: 'workbench.action.terminal.new',
    label: 'Nueva terminal',
    handler: 'terminal.new',
    palette: true
  },
  {
    id: 'workbench.action.terminal.copySelection',
    label: 'Terminal: copiar la selección',
    degradation:
      'la terminal de Scrakk la pinta Innerta y su API de selección todavía no está expuesta: el comando falla con este motivo en vez de copiar vacío',
    note: 'depende de Innerta (fuera del alcance actual de la capa)'
  },
  {
    id: 'workbench.action.terminal.selectAll',
    label: 'Terminal: seleccionar todo',
    degradation: 'depende de la API de selección de Innerta (no expuesta todavía)'
  },
  {
    id: 'workbench.action.terminal.clearSelection',
    label: 'Terminal: limpiar la selección',
    degradation: 'depende de la API de selección de Innerta (no expuesta todavía)'
  },
  {
    id: 'workbench.view.extension',
    label: 'Mostrar el panel de una extensión',
    handler: 'view.container.reveal',
    note: 'el arg es el id del contenedor (`viewsContainers.activitybar[].id`)'
  },

  // ── Archivos y carpetas ─────────────────────────────────────────────────
  {
    id: 'vscode.open',
    label: 'Abrir un archivo',
    handler: 'file.open',
    note: 'el primer arg es la URI (o el path) del archivo'
  },
  {
    id: 'vscode.openWith',
    label: 'Abrir un archivo con…',
    handler: 'file.openWith',
    note: 'el editor pedido se ignora (Scrakk abre el editor nativo); se avisa en el log'
  },
  {
    id: 'vscode.openFolder',
    label: 'Abrir una carpeta',
    handler: 'folder.open',
    note: 'sin arg abre el selector de carpetas del IDE'
  },
  {
    id: 'workbench.action.files.save',
    label: 'Guardar el archivo activo',
    native: 'file.save'
  },
  {
    id: 'workbench.action.files.saveAll',
    label: 'Guardar todos los archivos',
    handler: 'file.saveAll',
    palette: true
  },
  {
    id: 'workbench.action.closeActiveEditor',
    label: 'Cerrar el editor activo',
    native: 'editor.closeActiveFile'
  },

  // ── Sin equivalente todavía (se dice, no se finge) ──────────────────────
  {
    id: 'workbench.actions.view.problems',
    label: 'Panel de problemas',
    degradation:
      'Scrakk todavía no tiene un panel de problemas: los diagnósticos del LSP se ven en el editor, no en una lista',
    note: 'cuelga del trabajo de LSP/diagnósticos con Innerta'
  },
  {
    id: 'vscode.diff',
    label: 'Comparar dos archivos',
    degradation:
      'Scrakk todavía no tiene vista de diff: la extensión recibe un error con este motivo (no una pestaña en blanco)'
  },
  {
    id: 'vscode.changes',
    label: 'Ver cambios (SCM)',
    degradation: 'el panel de cambios multi-archivo no existe todavía en Scrakk'
  },
  {
    id: 'revealInExplorer',
    label: 'Revelar en el explorador',
    degradation:
      'el explorador de Scrakk todavía no expone «revelar»: el archivo se puede abrir, pero no resaltar en el árbol'
  },
  {
    id: 'workbench.action.openSettingsJson',
    label: 'Abrir los ajustes en JSON',
    degradation:
      'los ajustes de Scrakk son datos propios y no un `settings.json`: la edición en JSON crudo todavía no existe'
  }
]

/** Id → entrada. Los ids sin equivalente también están (para poder explicar). */
const BY_ID = new Map(BUILTIN_VSCODE_COMMANDS.map((entry) => [entry.id, entry]))

export function builtinCommand(id: string): BuiltinCommandEntry | undefined {
  return BY_ID.get(id)
}

/** Entradas con ruta: las que el IDE puede ejecutar hoy. */
export function routedBuiltinCommands(): BuiltinCommandEntry[] {
  return BUILTIN_VSCODE_COMMANDS.filter((entry) => entry.handler || entry.native)
}

/**
 * Mensaje de error de un comando SIN ruta. Incluye el motivo declarado: el
 * usuario (y el log) tienen que ver POR QUÉ no se puede, no un genérico.
 */
export function unsupportedCommandReason(id: string): string | null {
  const entry = BY_ID.get(id)
  if (!entry) return null
  return entry.degradation ?? null
}

/**
 * Motivo por el que un comando NO se pudo ejecutar.
 *
 * Un id DECLARADO sin equivalente explica su degradación; uno desconocido dice
 * simplemente que el IDE no lo tiene. La diferencia importa: `vscode.diff`
 * (declarado) no es lo mismo que un id mal escrito por la extensión.
 */
export function commandUnavailableReason(id: string): string {
  const declared = unsupportedCommandReason(id)
  if (declared) return `el IDE no tiene el comando "${id}": ${declared}`
  return `el IDE no tiene el comando "${id}"`
}
