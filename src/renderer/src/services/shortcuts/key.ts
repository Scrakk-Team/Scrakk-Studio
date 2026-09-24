// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sistema de shortcuts — parseo y matcheo de combos.
 */

import type { ParsedCombo, ShortcutModifier } from './types'

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '')

/** Alias de teclas comunes → nombre canónico (KeyboardEvent.key). */
const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  spacebar: ' ',
  ' ': ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  del: 'delete',
  ins: 'insert',
  pgup: 'pageup',
  pgdn: 'pagedown',
  capslock: 'capslock',
  numlock: 'numlock',
  scrolllock: 'scrolllock',
  printscreen: 'printscreen',
  pause: 'pause',
  contextmenu: 'contextmenu',
  meta: 'meta',
  command: 'meta',
  cmd: 'meta',
  win: 'meta',
  windows: 'meta'
}

const MODIFIER_KEYS = new Set<string>(['ctrl', 'control', 'alt', 'option', 'shift', 'meta'])

export function normalizeKey(raw: string): string {
  const lower = raw.trim().toLowerCase()
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower]
  if (lower.length === 1) return lower
  return lower
}

function comboToString(modifiers: Set<ShortcutModifier>, key: string): string {
  const mods = (['ctrl', 'alt', 'shift', 'meta'] as ShortcutModifier[]).filter((m) =>
    modifiers.has(m)
  )
  return [...mods, key].join('+')
}

/**
 * Parsea una especificación de combo ('shift+tab', 'mod+shift+p', 'f2').
 * 'mod' se resuelve a meta en macOS y ctrl en el resto.
 */
export function parseCombo(spec: string): ParsedCombo {
  const parts = spec
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)

  const modifiers = new Set<ShortcutModifier>()
  let key = ''
  for (const part of parts) {
    if (part === 'mod') {
      modifiers.add(IS_MAC ? 'meta' : 'ctrl')
    } else if (part === 'ctrl' || part === 'control') {
      modifiers.add('ctrl')
    } else if (part === 'alt' || part === 'option') {
      modifiers.add('alt')
    } else if (part === 'shift') {
      modifiers.add('shift')
    } else if (part === 'meta' || part === 'command' || part === 'cmd' || part === 'win' || part === 'windows') {
      modifiers.add('meta')
    } else {
      key = normalizeKey(part)
    }
  }

  if (!key) {
    throw new Error(`[shortcuts] El combo '${spec}' no tiene tecla principal.`)
  }

  return { combo: comboToString(modifiers, key), modifiers, key }
}

/**
 * Combo canónico del evento de teclado. Devuelve null si la tecla es solo un
 * modificador (Shift/Control/Alt/Meta presionados solos).
 */
export function eventToCombo(event: KeyboardEvent): string | null {
  const key = normalizeKey(event.key)
  if (MODIFIER_KEYS.has(event.key.toLowerCase())) return null

  const modifiers = new Set<ShortcutModifier>()
  if (event.ctrlKey) modifiers.add('ctrl')
  if (event.altKey) modifiers.add('alt')
  if (event.shiftKey) modifiers.add('shift')
  if (event.metaKey) modifiers.add('meta')

  return comboToString(modifiers, key)
}

/** ¿El evento ocurre dentro de un campo editable? */
export function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  if (!target) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}
