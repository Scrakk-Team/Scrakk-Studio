/**
 * Permisos de extensiones — catálogo y jail de rutas (puro, testeable).
 *
 * Modelo: deny-by-default. Una extensión solo puede lo que declara en su
 * manifest ("permissions": [...]) y AUN ASÍ el filesystem está enjaulado:
 *  - Lectura/escritura SOLO dentro de los roots del workspace abierto.
 *  - Rutas sensibles (~/.ssh, credenciales cloud, llaves privadas) denegadas
 *    SIEMPRE, incluso con permisos amplios.
 * El enforcement corre en el proceso main; acá vive la lógica pura.
 */

export const PERMISSIONS = {
  /** Leer archivos del workspace. */
  FS_READ: 'fs.read',
  /** Escribir/crear archivos del workspace. */
  FS_WRITE: 'fs.write',
  /** Acceso a todo el disco (peligroso, se pide explícito). */
  FS_ALL: 'fs.all',
  /** Ejecutar comandos en la máquina. */
  SHELL_EXEC: 'shell.exec',
  /** Requests HTTP salientes. */
  NETWORK_FETCH: 'network.fetch',
  /** Usar el runtime LSP (requests, diagnósticos). */
  LSP_USE: 'lsp.use'
} as const

export type PermissionId = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSION_IDS = Object.values(PERMISSIONS)

/** Descripción humana para la UI de instalación. */
export const PERMISSION_LABELS: Record<string, string> = {
  [PERMISSIONS.FS_READ]: 'Leer archivos del proyecto',
  [PERMISSIONS.FS_WRITE]: 'Escribir archivos del proyecto',
  [PERMISSIONS.FS_ALL]: 'Acceso completo al disco (peligroso)',
  [PERMISSIONS.SHELL_EXEC]: 'Ejecutar comandos en tu máquina (peligroso)',
  [PERMISSIONS.NETWORK_FETCH]: 'Hacer requests de red',
  [PERMISSIONS.LSP_USE]: 'Consultar el runtime LSP'
}

// ── Jail de rutas ──────────────────────────────────────────────────────────

/**
 * Patrones de rutas sensibles: SIEMPRE denegados para extensiones,
 * independientemente de los permisos declarados.
 */
export const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /(^|\/)\.ssh(\/|$)/i,
  /(^|\/)\.aws(\/|$)/i,
  /(^|\/)\.gcloud(\/|$)/i,
  /(^|\/)\.kube(\/|$)/i,
  /(^|\/)\.gnupg(\/|$)/i,
  /\.pem$/i,
  /\.key$/i,
  /(^|\/)id_rsa/i,
  /(^|\/)id_ed25519/i,
  /(^|\/)\.netrc$/i
]

export interface PathAccessContext {
  /**
   * Permisos declarados por la extensión. null = extensión desconocida /
   * sin registro → deny total (fail-closed).
   */
  declaredPermissions: readonly string[] | null
  /** Roots del workspace abierto. */
  workspaceRoots: readonly string[]
  /** Home del usuario (para resolver patrones relativos a ~). */
  homeDir: string
  /**
   * Roots EXTRA que le pertenecen a la extensión: su storage global, el del
   * workspace y sus logs.
   *
   * No es una excepción de conveniencia: en VS Code esos directorios SON de la
   * extensión (`context.globalStorageUri`, `context.storageUri`, `logUri`), y
   * cualquier extensión que guarde estado (credenciales, base de tareas,
   * cachés) los escribe al arrancar. Sin esto, una extensión real no puede ni
   * empezar — y las rutas sensibles siguen bloqueadas igual (paso 1).
   */
  allowedRoots?: readonly string[]
}

export interface PathAccessResult {
  allowed: boolean
  reason?: string
}

function isSensitive(path: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path))
}

function isInsideAny(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    const normalized = root.replace(/\\/g, '/').replace(/\/+$/, '')
    return path === normalized || path.startsWith(normalized + '/')
  })
}

/**
 * Verifica si una extensión puede acceder a una ruta con un modo dado.
 * Fail-closed ante cualquier duda.
 */
export function checkPathAccess(
  ctx: PathAccessContext,
  mode: 'read' | 'write',
  targetPath: string
): PathAccessResult {
  // 0) Extensión desconocida → deny.
  if (!ctx.declaredPermissions) {
    return { allowed: false, reason: 'extensión no registrada' }
  }

  // 1) Rutas sensibles: bloqueadas siempre.
  const normalized = targetPath.replace(/\\/g, '/')
  if (isSensitive(normalized)) {
    return { allowed: false, reason: 'ruta sensible protegida' }
  }

  // 2) Permiso específico requerido.
  const required = mode === 'read' ? PERMISSIONS.FS_READ : PERMISSIONS.FS_WRITE
  const hasAll = ctx.declaredPermissions.includes(PERMISSIONS.FS_ALL)
  if (!hasAll && !ctx.declaredPermissions.includes(required)) {
    return { allowed: false, reason: `sin permiso "${required}"` }
  }

  // 3) Con fs.all se permite fuera del workspace (pero jamás rutas sensibles).
  if (hasAll) return { allowed: true }

  // 4) Los directorios PROPIOS de la extensión (storage y logs) siempre.
  if (ctx.allowedRoots && isInsideAny(normalized, ctx.allowedRoots)) return { allowed: true }

  // 5) Jail: dentro de algún root del workspace.
  if (ctx.workspaceRoots.length === 0) {
    return { allowed: false, reason: 'sin workspace abierto' }
  }
  if (!isInsideAny(normalized, ctx.workspaceRoots)) {
    return { allowed: false, reason: 'ruta fuera del workspace' }
  }

  return { allowed: true }
}

/** ¿La extensión tiene un permiso puntual (no relacionado a rutas)? */
export function hasPermission(
  declared: readonly string[] | null,
  permission: PermissionId
): boolean {
  return declared?.includes(permission) ?? false
}
