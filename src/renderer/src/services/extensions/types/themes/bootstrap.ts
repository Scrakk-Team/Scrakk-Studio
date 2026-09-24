// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'themes' — bootstrap síncrono del tema al arrancar.
 *
 * Con la eliminación de themes.css no existe un tema base hardcodeado:
 * el primer paint DEBE tener ya aplicado un tema JSON builtin (sin flash).
 * Se llama desde main.tsx antes de montar React.
 *
 * Orden de resolución:
 *  1. Tema activo persistido por el sistema de extensiones (store.ts).
 *  2. Migración de la key legacy 'scrakk-studio-theme' (dark/light).
 *  3. Default: DEFAULT_THEME_ID (scrakk-night).
 */

import { normalizeThemeDefinition } from './schema'
import { loadStoredActive } from './store'
import { registerTheme, activateTheme, getActiveThemeId, DEFAULT_THEME_ID } from './logic'

/** Key antigua del ThemeProvider core (pre-sistema de extensiones). */
const LEGACY_KEY = 'scrakk-studio-theme'
const LEGACY_LIGHT_ID = 'scrakk-day'

/** JSONs builtin embebidos por Vite. Convención: builtin/themes/<ext-id>/theme.json */
const builtinThemeFiles = import.meta.glob<{ default: unknown }>(
  '../../builtin/themes/*/theme.json',
  { eager: true }
)

function builtinRawDefinition(extensionId: string): unknown | null {
  const suffix = `/builtin/themes/${extensionId}/theme.json`
  const match = Object.entries(builtinThemeFiles).find(([path]) => path.endsWith(suffix))
  return match ? match[1].default : null
}

/** Registra y activa un tema builtin sincrónicamente. Devuelve true si aplicó. */
function applyBuiltin(extensionId: string, id: string = extensionId): boolean {
  const raw = builtinRawDefinition(extensionId)
  const definition = normalizeThemeDefinition(raw)
  if (!definition) return false

  registerTheme({
    id,
    name: definition.name,
    type: definition.type,
    extensionId,
    isBuiltin: true,
    definition
  })
  return activateTheme(id)
}

export function applyStartupTheme(): void {
  if (typeof window === 'undefined') return
  if (getActiveThemeId()) return

  // 1) Persistido por el sistema de extensiones.
  const stored = loadStoredActive()
  if (stored && applyBuiltin(stored.extensionId, stored.id)) return

  // 2) Migración de la key legacy del ThemeProvider core.
  let legacyLight = false
  try {
    legacyLight = localStorage.getItem(LEGACY_KEY) === 'light'
  } catch {
    // Sin almacenamiento: cae al default.
  }
  if (legacyLight && applyBuiltin(LEGACY_LIGHT_ID, LEGACY_LIGHT_ID)) return

  // 3) Default builtin.
  applyBuiltin(DEFAULT_THEME_ID, DEFAULT_THEME_ID)
}
