/**
 * Guía de indentación ACTIVA del explorer (estilo VS Code, mínima): SOLO la
 * línea de la carpeta en foco (hover o selección) se resalta, y solo en las
 * filas de su subárbol. Nada de cadenas completas. Puro y testeable.
 */

function normalize(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Segmentos de `absPath` relativos a `root` ([] si no cuelga de root). */
export function relativeSegments(root: string, absPath: string): string[] {
  const r = normalize(root)
  const p = normalize(absPath)
  if (p === r) return []
  if (!p.startsWith(`${r}/`)) return []
  return p.slice(r.length + 1).split('/')
}

/** Nivel de guía que representa a la carpeta en foco (null = ninguna). */
export function focusGuideLevel(root: string | null, focusPath: string | null): number | null {
  if (!root || !focusPath) return null
  const segs = relativeSegments(root, focusPath)
  if (segs.length === 0) return null
  return segs.length - 1
}

/**
 * Nivel a resaltar en UNA fila (o null): solo si la fila ES la carpeta en
 * foco o desciende de ella. La fila muestra guías 0..level-1, así que la
 * línea aparece en sus descendientes, no en la propia fila.
 */
export function rowActiveGuideLevel(
  rowPath: string,
  focus: { path: string; level: number } | null
): number | null {
  if (!focus) return null
  const f = normalize(focus.path)
  const p = normalize(rowPath)
  // Solo DESCENDIENTES estrictos: la propia fila no pinta ese nivel.
  if (!p.startsWith(`${f}/`)) return null
  return focus.level
}
