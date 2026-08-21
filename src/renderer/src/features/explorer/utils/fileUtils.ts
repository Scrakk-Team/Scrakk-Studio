/**
 * Utilidades de rutas y nombres para el Explorer.
 */

/** Separa el directorio padre de una ruta absoluta. */
export function parentPathOf(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return index <= 0 ? filePath : filePath.slice(0, index)
}

/** Une un nombre a una ruta de directorio (sin duplicar separadores). */
export function joinPath(parent: string, name: string): string {
  if (!parent) return name
  return `${parent.replace(/[\\/]+$/, '')}/${name}`
}

/** Nombre de archivo/carpeta visible a partir de una ruta. */
export function baseNameOf(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return index === -1 ? filePath : filePath.slice(index + 1)
}

/** Valida un nombre nuevo de archivo o carpeta. */
export function isValidName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  if (trimmed === '.' || trimmed === '..') return false
  if (trimmed.includes('/') || trimmed.includes('\\')) return false
  if (/[\u0000-\u001f]/.test(trimmed)) return false
  return true
}

/** Si `candidate` vive dentro de `dir` (usado para no dropear una carpeta en sí misma). */
export function isWithin(child: string, dir: string): boolean {
  if (!dir) return false
  const normalized = dir.replace(/[\\/]+$/, '')
  return child === normalized || child.startsWith(`${normalized}/`) || child.startsWith(`${normalized}\\`)
}

/** Para input inline de rename: selecciona el nombre hasta la extensión. */
export function selectBasenameRange(input: HTMLInputElement, name: string): void {
  const dot = name.lastIndexOf('.')
  const end = dot > 0 ? dot : name.length
  input.setSelectionRange(0, end)
}
