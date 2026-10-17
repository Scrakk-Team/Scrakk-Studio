// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Contención REAL de rutas para el jail de extensiones.
 *
 * `shared/permissions` compara rutas normalizadas léxicamente (barato, puro y
 * probado), pero no resuelve symlinks. Un repo puede commitear
 * `<workspace>/data -> /home/<user>/.ssh`: `data/id_rsa` empieza por el root y
 * el check léxico lo deja pasar. Aquí se resuelve `realpath` de la ruta y de
 * cada root, incluido el ancestro existente más cercano para destinos que
 * todavía no existen.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/** `realpath` que tolera una cola que aún no existe (escrituras/creaciones). */
export async function realpathLoose(target: string): Promise<string> {
  let current = path.resolve(target)
  const tail: string[] = []
  for (;;) {
    try {
      const real = await fs.realpath(current)
      return path.join(real, ...tail.reverse())
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return path.resolve(target)
      tail.push(path.basename(current))
      current = parent
    }
  }
}

function sameOrInside(realTarget: string, realRoot: string): boolean {
  const target = process.platform === 'win32' ? realTarget.toLowerCase() : realTarget
  const root = process.platform === 'win32' ? realRoot.toLowerCase() : realRoot
  return target === root || target.startsWith(root + path.sep)
}

/** True si `target` cae dentro de alguno de `roots` tras resolver symlinks. */
export async function isRealPathInsideAny(
  roots: readonly string[],
  target: string
): Promise<boolean> {
  const realTarget = await realpathLoose(target)
  for (const root of roots) {
    if (!root) continue
    const realRoot = await realpathLoose(root)
    if (sameOrInside(realTarget, realRoot)) return true
  }
  return false
}
