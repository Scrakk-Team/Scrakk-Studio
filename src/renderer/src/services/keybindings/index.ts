// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Keymaps — aplicar/cambiar el preset de atajos sobre los COMANDOS.
 *
 * El motor de atajos (`services/shortcuts`) no se toca: cada comando del
 * registry declara su `keybinding` y el registry lo registra en el motor. Acá
 * solo se **re-registran** los comandos con el combo del preset elegido
 * (`allowOverwrite: true`, que además limpia el atajo viejo — ver
 * `commands/registry.ts`).
 *
 * Lo que no existe se reporta en `missing`; nunca se inventa un handler ni se
 * deja un no-op mudo.
 */

import { commandRegistry } from '@services/commands'
import { formatCombo } from '@services/shortcuts'
import { getPersistedKeymapPreset, persistKeymapPreset } from '@services/storage'
import { KEYMAP_PRESETS, KEYMAP_PRESET_IDS, type KeymapPresetId } from './presets'

export { KEYMAP_PRESETS, KEYMAP_PRESET_IDS }
export type { KeymapPresetId, KeymapBinding, KeymapPreset } from './presets'

export interface ApplyKeymapResult {
  /** Cuántos comandos se re-registraron. */
  applied: number
  /** Comandos del preset que todavía no existen en el registry. */
  missing: string[]
}

export function isKeymapPresetId(value: unknown): value is KeymapPresetId {
  return typeof value === 'string' && (KEYMAP_PRESET_IDS as string[]).includes(value)
}

function currentPreset(): KeymapPresetId {
  const stored = getPersistedKeymapPreset()
  return isKeymapPresetId(stored) ? stored : 'scrakk'
}

/**
 * Aplica un preset: cada comando existente pasa a tener el combo del preset
 * (o a quedar sin atajo si el preset dice `null`).
 */
export function applyKeymap(id: KeymapPresetId, options: { persist?: boolean } = {}): ApplyKeymapResult {
  const preset = KEYMAP_PRESETS[id]
  const missing: string[] = []
  let applied = 0

  for (const binding of preset.bindings) {
    const command = commandRegistry.get(binding.command)
    if (!command) {
      missing.push(binding.command)
      continue
    }
    const next = { ...command }
    if (binding.key) next.keybinding = binding.key
    else delete next.keybinding
    // `allowOverwrite` + el registry limpian el atajo anterior: nada queda vivo.
    commandRegistry.register(next, { allowOverwrite: true })
    applied += 1
  }

  if (options.persist !== false) persistKeymapPreset(id)
  return { applied, missing }
}

/** Preset activo (persistido). */
export function getActiveKeymap(): KeymapPresetId {
  return currentPreset()
}

/** Vuelve al keymap de Scrakk (equivale a aplicar el preset `scrakk`). */
export function resetKeymap(): ApplyKeymapResult {
  return applyKeymap('scrakk')
}

/**
 * Re-aplica el preset persistido. Se llama al arrancar, DESPUÉS de que los
 * comandos se registren: si no, el boot volvería siempre al keymap por defecto.
 */
export function restorePersistedKeymap(): ApplyKeymapResult {
  return applyKeymap(currentPreset(), { persist: false })
}

export interface KeybindingRow {
  command: string
  title: string
  category?: string
  /** Combo efectivo (o `null` si el comando no tiene atajo). */
  combo: string | null
  /** El mismo combo listo para mostrar (`Ctrl+Shift+P`). */
  display: string
}

/** Vista de los atajos efectivos (para Ajustes → Atajos). */
export function listKeybindings(): KeybindingRow[] {
  return commandRegistry.list().map((command) => {
    const combo = command.keybinding ?? null
    return {
      command: command.id,
      title: command.title,
      category: command.category,
      combo,
      display: combo ? formatCombo(combo) : ''
    }
  })
}
