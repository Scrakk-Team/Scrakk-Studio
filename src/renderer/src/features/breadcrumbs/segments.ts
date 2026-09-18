/**
 * Segmentos del breadcrumb — puro, sin React ni imports con efectos.
 * Testeable en node sin DOM ni engine.
 */

export interface CrumbSegment {
  name: string
  /** Absoluto (dir) o archivo. */
  path: string
  isFile: boolean
  isRoot: boolean
}

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}

function baseOf(p: string): string {
  const clean = norm(p)
  const cut = clean.lastIndexOf('/')
  if (cut < 0) return clean
  return clean.slice(cut + 1) || clean
}

/**
 * Segmentos root > dirs > archivo. Fuera del root: solo el archivo.
 */
export function buildSegments(root: string | null, filePath: string | null): CrumbSegment[] {
  if (!filePath) return []
  const file = norm(filePath)
  if (!root) return [{ name: baseOf(file) || file, path: filePath, isFile: true, isRoot: false }]
  const base = norm(root)
  if (file !== base && !file.startsWith(`${base}/`)) {
    return [{ name: baseOf(file), path: filePath, isFile: true, isRoot: false }]
  }
  const segments: CrumbSegment[] = [
    { name: baseOf(base) || base, path: root, isFile: false, isRoot: true }
  ]
  if (file === base) return segments
  const parts = file.slice(base.length + 1).split('/')
  let acc = base
  parts.forEach((part, index) => {
    acc += `/${part}`
    segments.push({
      name: part,
      path: acc,
      isFile: index === parts.length - 1,
      isRoot: false
    })
  })
  return segments
}
