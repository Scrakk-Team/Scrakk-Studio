// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo de extensión 'keybindings' — schema.
 *
 * Una extensión declara atajos que apuntan a COMANDOS (los de la paleta, o los
 * suyos en el Extension Host). Mismo formato que el resto del SEF: `command` +
 * `key` (combinación o chord, `ctrl+k ctrl+s`).
 *
 * `when` NO se acepta: un atajo condicionado por contexto aplicado como global
 * cambia el comportamiento. La entrada se descarta con aviso.
 */

import { parseComboSpec } from '../../../shortcuts/key'
import type { ParseContext } from '../handler'

export interface KeybindingContribution {
  /** Id del comando a ejecutar (el de la paleta, `<extId>:<id>` o el del host). */
  command: string
  /** Combo o chord: `ctrl+shift+p`, `ctrl+k ctrl+s`. */
  key: string
}

export function parseKeybindingContributions(
  raw: unknown,
  _ctx: ParseContext
): KeybindingContribution[] | null {
  if (!Array.isArray(raw)) return null
  const out: KeybindingContribution[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const command = typeof entry.command === 'string' ? entry.command.trim() : ''
    const key = typeof entry.key === 'string' ? entry.key.trim() : ''
    if (!command || !key) continue
    if (entry.when !== undefined) {
      console.warn(`[extensions/keybindings] "${command}": 'when' no está soportado — se omite`)
      continue
    }
    try {
      parseComboSpec(key)
    } catch {
      console.warn(`[extensions/keybindings] "${command}": combinación inválida "${key}"`)
      continue
    }
    out.push({ command, key })
  }

  return out
}
