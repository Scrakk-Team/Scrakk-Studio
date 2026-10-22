// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Paleta ANSI en archivo aparte (`ansi.json`).
 *
 * Convención, idéntica para builtin e instalados: un `ansi.json` HERMANO del
 * `theme.json` dentro de la carpeta del tema. Trae el mismo objeto que admite
 * la clave inline `ansi` de theme.json, sin envoltorio:
 *
 *   { "black": "#0a0a0a", "red": "#d92d20", …, "brightWhite": "#ffffff" }
 *
 * Por qué dos formas: el JSON inline sirve para temas chicos, y el archivo
 * permite que una paleta larga (16 slots) no infle el theme.json y que se
 * pueda reusar entre los dos archivos de un pack (día/noche).
 *
 * Precedencia: el archivo gana sobre el inline slot por slot.
 */

import type { ThemeAnsi, ThemeDefinition } from './schema'
import { normalizeThemeAnsi } from './schema'

/**
 * ANSI builtin: JSONs embebidos por Vite en build-time.
 * (2 niveles desde types/themes/: ../../ = services/extensions/)
 */
const builtinAnsiFiles = import.meta.glob<{ default: unknown }>(
  '../../builtin/themes/*/ansi.json',
  { eager: true }
)

/** `ansi.json` crudo de un tema builtin (null si el pack no trae archivo). */
export function builtinAnsiDefinition(extensionId: string): unknown | null {
  const suffix = `/builtin/themes/${extensionId}/ansi.json`
  const match = Object.entries(builtinAnsiFiles).find(([path]) => path.endsWith(suffix))
  return match ? match[1].default : null
}

/**
 * Ruta del `ansi.json` hermano de un `theme.json` del pack
 * (`themes/foo.json` → `themes/ansi.json`). Conserva el directorio: un pack
 * puede aportar varios temas desde subcarpetas distintas.
 */
export function siblingAnsiPath(themePath: string): string {
  const cut = Math.max(themePath.lastIndexOf('/'), themePath.lastIndexOf('\\'))
  return cut === -1 ? 'ansi.json' : `${themePath.slice(0, cut + 1)}ansi.json`
}

/**
 * Mezcla la paleta del ARCHIVO sobre la inline y devuelve la definición
 * actualizada. Sin archivo (o inválido) devuelve la misma definición.
 */
export function mergeAnsiFile(
  definition: ThemeDefinition,
  rawFile: unknown
): ThemeDefinition {
  const fromFile: ThemeAnsi | undefined = normalizeThemeAnsi(rawFile)
  if (!fromFile) return definition
  return { ...definition, ansi: { ...(definition.ansi ?? {}), ...fromFile } }
}
