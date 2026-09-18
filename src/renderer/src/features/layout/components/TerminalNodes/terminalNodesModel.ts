/**
 * Modelo puro del lienzo de terminales: puertos de unión dinámicos,
 * enlaces entre nodos y grupos conectados (para el agarrador grupal).
 * Sin React ni DOM: testeable en vitest.
 */

export interface PortPos { x: number; y: number }
export interface Link { id: string; a: string; b: string; ap: number; bp: number }

/** Total de puertos alrededor del perímetro: escala con el tamaño del nodo. */
export function portCountForSize(w: number, h: number): number {
  const n = Math.round((2 * (w + h)) / 220)
  return Math.min(20, Math.max(4, n))
}

/**
 * Reparte N puntos uniformemente por el perímetro del rectángulo
 * (empieza arriba-centro, sentido horario). Coordenadas relativas al nodo.
 */
export function portPositions(w: number, h: number): PortPos[] {
  const n = portCountForSize(w, h)
  const perimeter = 2 * (w + h)
  const pts: PortPos[] = []
  for (let i = 0; i < n; i++) {
    let d = (i / n) * perimeter
    // Lados: arriba (w) → derecha (h) → abajo (w) → izquierda (h).
    if (d < w) pts.push({ x: d, y: 0 })
    else if ((d -= w) < h) pts.push({ x: w, y: d })
    else if ((d -= h) < w) pts.push({ x: w - d, y: h })
    else { d -= w; pts.push({ x: 0, y: h - d }) }
  }
  return pts
}

/**
 * Componentes conexas (union-find) sobre los ids dados y los enlaces.
 * Solo considera enlaces con AMBOS extremos presentes.
 */
export function connectedGroups(ids: string[], links: Array<Pick<Link, 'a' | 'b'>>): string[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = parent.get(x) ?? x
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root) as string
    // Compresión de camino.
    let cur = x
    while (cur !== root) {
      const next = parent.get(cur) ?? root
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const union = (a: string, b: string): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  const known = new Set(ids)
  for (const link of links) {
    if (known.has(link.a) && known.has(link.b)) union(link.a, link.b)
  }
  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const root = find(id)
    const arr = groups.get(root)
    if (arr) arr.push(id)
    else groups.set(root, [id])
  }
  return [...groups.values()]
}

/**
 * Centroide de los CENTROS de los miembros (para el agarrador grupal).
 * `rects`: id → {x, y, w, h} en coords de mundo.
 */
export function groupCentroid(members: string[], rects: Record<string, { x: number; y: number; w: number; h: number }>): { x: number; y: number } | null {
  const valid = members.filter((m) => rects[m])
  if (valid.length === 0) return null
  let sx = 0
  let sy = 0
  for (const m of valid) {
    sx += rects[m].x + rects[m].w / 2
    sy += rects[m].y + rects[m].h / 2
  }
  return { x: sx / valid.length, y: sy / valid.length }
}
