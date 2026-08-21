/**
 * Módulo compartido (main + preload + renderer) — contrato IPC del sistema
 * de extensiones SEF.
 *
 * El renderer no tiene acceso al filesystem de Node. Instalar/desinstalar
 * extensiones del usuario corre en el proceso main: se descomprime el `.sef`
 * en `app.getPath('userData')/extensions/<id>/` y se devuelve el summary.
 */

export const EXTENSIONS_IPC = {
  installSef: 'extensions:install-sef',
  uninstall: 'extensions:uninstall',
  listInstalled: 'extensions:list-installed',
  extensionsDir: 'extensions:extensions-dir',
  pickSef: 'extensions:pick-sef'
} as const

// ── Installed ─────────────────────────────────────────────────────────────

export interface InstalledExtensionInfo {
  id: string
  name: string
  version: string
  author?: string
  /** Directorio de la extensión dentro de userData/extensions. */
  dir: string
}

// ── Install SEF ────────────────────────────────────────────────────────────

export interface InstallSefRequest {
  path: string
}

export type InstallSefResponse =
  | { success: true; extension: InstalledExtensionInfo }
  | { success: false; error: string }

// ── Uninstall ──────────────────────────────────────────────────────────────

export interface UninstallRequest {
  id: string
}

export interface UninstallResponse {
  success: boolean
  error?: string
}

// ── Pick SEF (diálogo nativo) ──────────────────────────────────────────────

export interface PickSefResponse {
  success: boolean
  path?: string
  error?: string
}

// ── API type for preload ───────────────────────────────────────────────────

export interface ExtensionsApi {
  /** Descomprime un `.sef` en userData/extensions/<id> y devuelve su info. */
  installSef: (path: string) => Promise<InstallSefResponse>
  /** Borra la carpeta instalada de una extensión. */
  uninstall: (id: string) => Promise<UninstallResponse>
  /** Lista las extensiones del usuario instaladas en userData. */
  listInstalled: () => Promise<InstalledExtensionInfo[]>
  /** Ruta absoluta de userData/extensions (creada si no existe). */
  extensionsDir: () => Promise<string>
  /** Abre el diálogo nativo para elegir un archivo `.sef`. */
  pickSef: () => Promise<PickSefResponse>
}