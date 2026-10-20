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
import { msg } from '@core/i18n'
import {
  getPersistedKeymapOverrides,
  getPersistedKeymapPreset,
  persistKeymapOverrides,
  persistKeymapPreset,
  type KeymapOverrides
} from '@services/storage'
import { KEYMAP_PRESETS, KEYMAP_PRESET_IDS, type KeymapPresetId } from './presets'

export { KEYMAP_PRESETS, KEYMAP_PRESET_IDS }
export type { KeymapPresetId, KeymapBinding, KeymapPreset } from './presets'

/**
 * Combos de fábrica (los que declara el código), capturados una vez y antes de
 * aplicar cualquier preset: es a lo que vuelve "reiniciar" un comando.
 */
const originals = new Map<string, string | null>()
let originalsCaptured = false

function captureOriginals(): void {
  if (originalsCaptured) return
  for (const command of commandRegistry.list()) {
    originals.set(command.id, command.keybinding ?? null)
  }
  originalsCaptured = true
}

/** Re-registra un comando con otro combo (o sin ninguno). */
function applyToCommand(id: string, key: string | null): boolean {
  const command = commandRegistry.get(id)
  if (!command) return false
  const next = { ...command }
  if (key) next.keybinding = key
  else delete next.keybinding
  commandRegistry.register(next, { allowOverwrite: true })
  return true
}

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
export function applyKeymap(
  id: KeymapPresetId,
  options: { persist?: boolean; applyOverrides?: boolean } = {}
): ApplyKeymapResult {
  captureOriginals()
  const preset = KEYMAP_PRESETS[id]
  const missing: string[] = []
  let applied = 0

  for (const binding of preset.bindings) {
    // `allowOverwrite` + el registry limpian el atajo anterior: nada queda vivo.
    if (applyToCommand(binding.command, binding.key)) applied += 1
    else missing.push(binding.command)
  }

  if (options.persist !== false) persistKeymapPreset(id)
  // Un preset no pisa los rebinds manuales del usuario: van encima.
  if (options.applyOverrides !== false) applyOverrides()
  return { applied, missing }
}

/** Aplica los rebinds guardados (encima del preset). */
export function applyOverrides(overrides: KeymapOverrides = getPersistedKeymapOverrides()): void {
  for (const [id, key] of Object.entries(overrides)) applyToCommand(id, key)
}

/** Rebind manual de un comando (persistido). `key = null` lo deja sin atajo. */
export function setCommandKeybinding(id: string, key: string | null): boolean {
  captureOriginals()
  if (!applyToCommand(id, key)) return false
  const overrides = getPersistedKeymapOverrides()
  overrides[id] = key
  persistKeymapOverrides(overrides)
  return true
}

/** Saca el override y devuelve el comando a su combo de fábrica. */
export function resetCommandKeybinding(id: string): void {
  captureOriginals()
  const overrides = getPersistedKeymapOverrides()
  if (id in overrides) {
    delete overrides[id]
    persistKeymapOverrides(overrides)
  }
  const original = originals.get(id)
  if (original !== undefined) applyToCommand(id, original)
}

/** Preset activo (persistido). */
export function getActiveKeymap(): KeymapPresetId {
  return currentPreset()
}

/** Vuelve todo al keymap de Scrakk: preset `scrakk` y overrides borrados. */
export function resetKeymap(): ApplyKeymapResult {
  persistKeymapOverrides({})
  return applyKeymap('scrakk', { applyOverrides: false })
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
  /** true = tiene un rebind manual (encima del preset). */
  overridden: boolean
  /** Combo de fábrica (para el "reiniciar"). */
  original: string | null
}

/** Vista de los atajos efectivos (para Ajustes → Atajos). */
export function listKeybindings(): KeybindingRow[] {
  captureOriginals()
  const overrides = getPersistedKeymapOverrides()
  return commandRegistry.list().map((command) => {
    const combo = command.keybinding ?? null
    return {
      command: command.id,
      // Traducido (la paleta ya lo hace con `msg`): sin esto la UI mostraba la
      // CLAVE cruda, tipo `core.cambia.tema`.
      title: msg(command.title),
      category: command.category,
      combo,
      display: combo ? formatCombo(combo) : '',
      overridden: Object.prototype.hasOwnProperty.call(overrides, command.id),
      original: originals.get(command.id) ?? null
    }
  })
}
