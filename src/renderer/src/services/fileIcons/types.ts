/**
 * FileIcons — tipos del sistema de iconos de archivos.
 *
 * Independiente del Explorer y de las extensiones: cualquier superficie
 * (explorer, tabs, palette, búsquedas) resuelve iconos por nombre/path con
 * la misma API. Las extensiones SEF solo APORTAN temas vía
 * `contributes.fileIcons`; jamás tocan este registry directamente.
 *
 * Formato de asset elegido: `iconDefinitions` como mapa id → data URI
 * embebido (`data:image/svg+xml;base64,…` / `data:image/png;base64,…`).
 * - Offline 100% (un solo readFile del icons.json, sin binarios sueltos).
 * - Portable en el .sef (un JSON, sin layout de carpetas que versionar).
 * - El traductor VS Code produce exactamente esto (iconPath → data URI),
 *   así que SEF nativo y VSIX convertido hablan el mismo idioma.
 * A futuro, si un tema es gigante, se puede trocear por chunks sin cambiar
 * la forma de consumo (resolveIcon sigue devolviendo data URIs).
 */

/** Tema de iconos de archivos (formato SEF `fileIcons`, no 1:1 VS Code). */
export interface FileIconTheme {
  /** Id global del tema (único entre todas las extensiones). */
  id: string
  /** Nombre visible en el picker. */
  name: string
  /** Mapa id de icono → data URI lista para <img src>. */
  iconDefinitions: Record<string, string>
  /** Extensión (sin punto, lower) → id de iconDefinitions. */
  fileExtensions?: Record<string, string>
  /** Nombre exacto de archivo (lower, ej "package.json") → id. */
  fileNames?: Record<string, string>
  /** Nombre exacto de carpeta (lower) → id. */
  folderNames?: Record<string, string>
  /** Carpeta expandida → id (fallback a folderNames si falta). */
  folderNamesExpanded?: Record<string, string>
  /** Ids de lenguaje (ej "typescript") → id. Opcional, para tabs/editor. */
  languageIds?: Record<string, string>
  /** Defaults cuando no hay match. */
  file?: string
  folder?: string
  folderExpanded?: string
  rootFolder?: string
  rootFolderExpanded?: string
  /** Si true, el explorer puede ocultar sus chevrons (respeta tema). */
  hidesExplorerArrows?: boolean
}

/** Entrada registrada (tema + procedencia para desinstalar). */
export interface RegisteredFileIconTheme {
  id: string
  name: string
  extensionId: string
  isBuiltin: boolean
  theme: FileIconTheme
}

/** Argumentos de resolución (los que necesita cualquier consumidor). */
export interface ResolveFileIconArgs {
  /** Nombre base del archivo/carpeta (ej "App.tsx"). */
  name: string
  /** Path completo opcional (para rootFolder vs folder). */
  path?: string
  isDirectory: boolean
  isExpanded?: boolean
  /** Id de lenguaje opcional (editor/tabs lo conocen). */
  languageId?: string
  /** True si es la carpeta raíz del workspace. */
  isRoot?: boolean
}
