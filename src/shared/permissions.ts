// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Permisos de extensiones — catálogo y jail de rutas (puro, testeable).
 *
 * Modelo: deny-by-default. Una extensión solo puede lo que declara en su
 * manifest ("permissions": [...]) y AUN ASÍ el filesystem está enjaulado:
 *  - Lectura/escritura SOLO dentro de los roots del workspace abierto.
 *  - Rutas sensibles (~/.ssh, credenciales cloud, llaves privadas) denegadas
 *    SIEMPRE, incluso con permisos amplios.
 * El enforcement corre en el proceso main; aquí vive la lógica pura.
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

/**
 * Ruta de credencial conocida (`.ssh`, `.aws`, `.gnupg`, `.pem`…). La usan
 * otros canales que no pasan por el jail de extensiones (p. ej. encodings)
 * para no exponer claves privadas a un renderer comprometido.
 */
export function isSensitiveCredentialPath(filePath: string): boolean {
  return isSensitive(normalizeFsPath(filePath))
}

/**
 * Normalización LEXICAL de una ruta: resuelve `.` y `..` como haría el sistema
 * de archivos al abrir la ruta, colapsa separadores duplicados y quita la barra
 * final. Sin `node:path` a propósito — este módulo es puro y lo importa el
 * renderer — pero con la misma semántica.
 *
 * POR QUÉ EXISTE: el jail comparaba la ruta CRUDA contra los roots. Eso hace
 * que `<root>/../../Users/victim/.ssh` empiece por `<root>/` y se cuele como si
 * estuviera dentro. Normalizar ANTES de comparar es lo que cierra el agujero.
 *
 * No resuelve symlinks (eso necesita `fs.realpath`, en el proceso main).
 */
export function normalizeFsPath(input: string): string {
  // 1) Separadores Windows y POSIX a '/'.
  let rest = input.replace(/\\/g, '/')

  // 2) Prefijo de raíz: 'C:/', UNC '//servidor/...' o '/'.
  let root = ''
  const drive = /^([a-zA-Z]:)\//.exec(rest)
  if (drive) {
    root = `${drive[1]}/`
    rest = rest.slice(drive[0].length)
  } else if (rest.startsWith('//')) {
    root = '//'
    rest = rest.slice(2)
  } else if (rest.startsWith('/')) {
    root = '/'
    rest = rest.slice(1)
  }

  // 3) Resolver segmentos, dejando pasar los '..' que no se pueden absorber.
  const out: string[] = []
  for (const segment of rest.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      const last = out[out.length - 1]
      if (last !== undefined && last !== '..') out.pop()
      else if (root === '') out.push('..')
      // Con raíz absoluta, un '..' de más se descarta contra la propia raíz
      // (igual que `path.resolve`).
      continue
    }
    out.push(segment)
  }

  const joined = out.join('/')
  if (root === '//') return `//${joined}`
  if (root === '/') return `/${joined}`
  if (root) return joined ? `${root}${joined}` : root
  return joined === '' ? '.' : joined
}

/**
 * ¿`targetPath` cae dentro de alguno de los `roots`?
 *
 * Normaliza AMBOS lados: si sólo se normalizara el target, un root con '..'
 * dejaría de casar. Una ruta relativa nunca está dentro de un root absoluto, así
 * que el fallo sigue siendo fail-closed.
 */
function isInsideAny(targetPath: string, roots: readonly string[]): boolean {
  const target = normalizeFsPath(targetPath)
  return roots.some((root) => {
    const normalized = normalizeFsPath(root)
    // Un root que YA termina en '/' (raíz POSIX o UNC) no debe compararse
    // contra '//': usarlo tal cual evita que '/' nunca case con nada.
    const prefix = normalized.endsWith('/') ? normalized : `${normalized}/`
    return target === normalized || target.startsWith(prefix)
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

  // 0b) Un NUL truncaría la ruta en cualquier capa inferior (y `path.resolve`
  // lo lanza). Se rechaza antes de normalizar.
  if (targetPath.includes('\0')) {
    return { allowed: false, reason: 'ruta inválida' }
  }

  // La normalización va ANTES de las dos comprobaciones: sin ella, `..` esquiva
  // tanto el patrón de ruta sensible como el jail.
  const normalized = normalizeFsPath(targetPath)

  // 1) Rutas sensibles: bloqueadas siempre.
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

/**
 * ¿La extensión puede recibir el TEXTO de este documento?
 *
 * El manager difundía cada `doc/open`/`doc/change` a todas las sesiones, con
 * ruta y contenido completo, aunque la extensión no tuviera `fs.read` o el
 * archivo estuviera fuera de su workspace (p. ej. `~/.aws/credentials` abierto
 * a mano). Solo se entrega lo que podría leer por `fs`.
 */
export function canReadDocument(
  declared: readonly string[] | null,
  workspaceRoots: readonly string[],
  filePath: string
): boolean {
  if (!hasPermission(declared, PERMISSIONS.FS_READ)) return false
  const target = normalizeFsPath(filePath)
  return workspaceRoots.some((root) => {
    const base = normalizeFsPath(root)
    return target === base || target.startsWith(base.endsWith('/') ? base : base + '/')
  })
}
