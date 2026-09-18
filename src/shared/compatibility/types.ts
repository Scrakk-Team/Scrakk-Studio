/**
 * Compatibility — tipos compartidos (main + renderer + tests).
 *
 * El pipeline VSIX → SEF produce un manifest SEF puro + assets. El core SEF
 * (loader/resolve) nunca sabe que hubo traducción: solo ve una extensión
 * convertida ya lista.
 */

export type CompatSource = 'vscode' | 'zed'

export interface MappedApi {
  source: string
  target: string | null
  support: 'full' | 'partial' | 'none'
  note?: string
}

export interface CompatReport {
  /** 0..1 — traducidos / detectados (solo contribution points con contenido). */
  coverage: number
  supported: MappedApi[]
  partial: MappedApi[]
  unsupported: MappedApi[]
  /** Advertencia humana (cobertura parcial) o null. */
  warning: string | null
  /** Chequeo de engines.vscode contra la versión de la app. */
  versionCheck: { ok: boolean; detail: string }
  requiresNode: boolean
}

/** Error honesto del pipeline: dice QUÉ es la extensión y POR QUÉ no se instala. */
export interface UntranslatableError extends Error {
  code: 'untranslatable'
  /** Clasificación por tipos (la capa 2). */
  kindsDescription: string
}

/** Archivo del .vsix ya extraído. */
export interface VsixFileEntry {
  path: string
  data: Uint8Array
}

export interface VsixPackageJson {
  name: string
  displayName?: string
  publisher?: string
  version?: string
  description?: string
  author?: string
  main?: string
  browser?: string
  engines?: { vscode?: string; [k: string]: string | undefined }
  contributes?: {
    iconThemes?: Array<{ id: string; label: string; path: string }>
    themes?: Array<{ id?: string; label: string; path: string; uiTheme?: string }>
    productIconThemes?: Array<{ id: string; label: string; path: string }>
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Contribución SEF fileIcons generada por el traductor. */
export interface TranslatedFileIconContribution {
  id: string
  name: string
  path: string
}

/** Contribución SEF themes generada por el traductor. */
export interface TranslatedThemeContribution {
  id: string
  name: string
  type: 'dark' | 'light'
  path: string
}

/** Salida del traductor de iconos: contribuciones + assets (path → JSON). */
export interface IconsTranslation {
  contributions: TranslatedFileIconContribution[]
  /** path relativo dentro del SEF materializado → contenido JSON. */
  assets: Map<string, string>
  mapped: MappedApi[]
}

/** Resultado del pipeline completo, listo para materializar como SEF. */
export interface ConvertedExtension {
  /** Id SEF namespaced por el converter (vscode-<pub>.<name>). */
  id: string
  name: string
  version: string
  manifest: Record<string, unknown>
  /** Todos los archivos a escribir en userData/extensions/<id>/. */
  files: Map<string, Uint8Array | string>
  report: CompatReport
}
