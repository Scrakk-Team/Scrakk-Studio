// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Lenguajes tree-sitter PREINSTALADOS (carpeta `langs/`).
 *
 * Cada lenguaje vive en `langs/<id>/` (manifest + `grammars/<id>.wasm` +
 * `queries/*.scm`) y `langs/manifest.json` declara TODOS como una sola
 * extensión. El IDE la registra por el camino normal de extensiones, así que
 * agregar o actualizar un lenguaje es regenerar una carpeta: **no se recompila
 * el motor**.
 *
 * La carpeta la genera `tools/build-langs.mjs` (compila cada lenguaje a su
 * propio wasm) y, en el paquete, electron-builder la copia a `resources/langs`.
 */

import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

let cached: string | null | undefined

/** Directorio de `langs/` si existe (dev o empaquetado); null si no hay pack. */
export function resolveLangsDir(): string | null {
  if (cached !== undefined) return cached
  const candidates: string[] = []
  try {
    // Empaquetado: electron-builder copia `langs/` a resources/.
    if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'langs'))
  } catch {
    // Sin `process.resourcesPath` (tests / web): se prueba el siguiente.
  }
  try {
    // Dev: la raíz del proyecto (app.getAppPath()).
    const appPath = (app as { getAppPath?: () => string } | undefined)?.getAppPath?.()
    if (appPath) candidates.push(path.join(appPath, 'langs'))
  } catch {
    // Sin `electron.app` (tests): no hay pack.
  }
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'manifest.json'))) {
        cached = dir
        return cached
      }
    } catch {
      // Candidato ilegible: se prueba el siguiente.
    }
  }
  cached = null
  return cached
}

/** Para tests: olvida la resolución cacheada. */
export function resetLangsDirCache(): void {
  cached = undefined
}
