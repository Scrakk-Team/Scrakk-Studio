// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Filtro de visibles para el árbol (sección Cambios de git, etc.).
 *
 * Dado un set de paths visibles, calcula los directorios ancestros para
 * mantener la estructura del árbol y filtra la lista plana. Puro y testeado.
 */

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}

function parentOf(p: string): string | null {
  const clean = norm(p)
  const index = clean.lastIndexOf('/')
  if (index <= 0) return null
  return clean.slice(0, index)
}

/** Ancestros (excluyendo el propio path) hasta `root` inclusive. */
export function ancestorDirs(root: string, paths: Iterable<string>): Set<string> {
  const base = norm(root)
  const out = new Set<string>()
  for (const raw of paths) {
    let dir = parentOf(raw)
    while (dir !== null) {
      out.add(dir)
      if (dir === base) break
      // Fuera del root: cortar (paths ajenos no expanden nada útil).
      if (!dir.startsWith(`${base}/`) && dir !== base) break
      dir = parentOf(dir)
    }
  }
  out.delete(base)
  return out
}

/** Filtra filas planas a visibles + ancestros (preserva orden). */
export function filterRowsByPaths<T extends { node: { path: string } }>(
  flat: T[],
  visible: Set<string>,
  ancestors: Set<string>
): T[] {
  return flat.filter((row) => visible.has(row.node.path) || ancestors.has(row.node.path))
}
