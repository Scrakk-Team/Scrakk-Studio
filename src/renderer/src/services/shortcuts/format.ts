// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Formateo de combos para UI — de forma canónica a display.
 *
 *   'mod+shift+p' → ⌘⇧P  (macOS) | Ctrl+Shift+P  (resto)
 *
 * Puro y testeable: no toca DOM ni el registry.
 */

import { IS_MAC } from './key'

const MODIFIER_DISPLAY_MAC: Record<string, string> = {
  mod: '⌘',
  meta: '⌘',
  ctrl: '⌃',
  control: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧'
}

const MODIFIER_DISPLAY_REST: Record<string, string> = {
  mod: 'Ctrl',
  meta: 'Meta',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift'
}

const KEY_DISPLAY: Record<string, string> = {
  enter: 'Enter',
  return: '↵',
  escape: 'Esc',
  esc: 'Esc',
  space: 'Space',
  backspace: '⌫',
  delete: 'Del',
  del: 'Del',
  tab: 'Tab',
  arrowup: '↑',
  up: '↑',
  arrowdown: '↓',
  down: '↓',
  arrowleft: '←',
  left: '←',
  arrowright: '→',
  right: '→',
  pageup: 'PgUp',
  pgup: 'PgUp',
  pagedown: 'PgDn',
  pgdn: 'PgDn',
  insert: 'Ins',
  ins: 'Ins'
}

/**
 * 'mod+shift+p' → representación humana según plataforma.
 * `isMac` inyectable para tests; default: plataforma real.
 */
export function formatCombo(combo: string, isMac: boolean = IS_MAC): string {
  const mac = isMac
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  const modifiers: string[] = []
  let key = ''

  for (const part of parts) {
    if (mac && MODIFIER_DISPLAY_MAC[part]) {
      modifiers.push(MODIFIER_DISPLAY_MAC[part])
    } else if (!mac && MODIFIER_DISPLAY_REST[part]) {
      modifiers.push(MODIFIER_DISPLAY_REST[part])
    } else if (KEY_DISPLAY[part]) {
      key = KEY_DISPLAY[part]
    } else if (/^f\d{1,2}$/.test(part)) {
      key = part.toUpperCase()
    } else if (part.length === 1) {
      key = part.toUpperCase()
    } else {
      key = part.charAt(0).toUpperCase() + part.slice(1)
    }
  }

  const all = [...modifiers]
  if (key) all.push(key)

  // macOS une símbolos sin separador; el resto usa '+'.
  return all.join(mac ? '' : '+')
}
