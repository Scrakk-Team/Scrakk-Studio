/**
 * Directorio en disco de cada extensión instalada.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 *
 * Los tipos de extensión trabajan con el `ExtensionTypeContext`, que sabe leer
 * un archivo del paquete (`ctx.readFile`) pero **no dice dónde vive el
 * paquete**: en el renderer (sandbox, sin Node) no hay forma de derivarlo.
 *
 * Hasta ahora alcanzaba, porque todo se resolvía leyendo el contenido. Pero el
 * tokenizador de gramáticas corre en el MAIN y recibe RUTAS (el archivo es
 * grande y se cachea por `mtime`: mandar el contenido por IPC en cada tecla
 * sería justo lo que hay que evitar). Esa ruta necesita el directorio.
 *
 * Se llena al cargar cada extensión instalada, así que está disponible para
 * todo lo que corra después del boot. Las builtin no están acá a propósito: su
 * data es embebida y no tienen archivos en disco.
 * ─────────────────────────────────────────────────────────────────────────
 */

const dirs = new Map<string, string>()

export function setExtensionDir(extensionId: string, dir: string): void {
  if (!extensionId || !dir) return
  dirs.set(extensionId, dir)
}

export function getExtensionDir(extensionId: string): string | undefined {
  return dirs.get(extensionId)
}

/** Une el directorio con una ruta relativa del paquete (sin duplicar `/`). */
export function resolvePackagePath(extensionId: string, relativePath: string): string | null {
  const dir = dirs.get(extensionId)
  if (!dir) return null
  const clean = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '')
  if (!clean || clean.includes('..')) return null
  return `${dir.replace(/\/+$/, '')}/${clean}`
}

/** Al desinstalar: si no, una ruta vieja seguiría resolviéndose al aire. */
export function forgetExtensionDir(extensionId: string): void {
  dirs.delete(extensionId)
}

/** Para tests: deja el registro vacío. */
export function resetExtensionDirs(): void {
  dirs.clear()
}
