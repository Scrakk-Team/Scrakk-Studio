// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sistema de shortcuts — API pública.
 *
 * Otros módulos registran sus atajos con:
 *   - `useShortcut(combo, handler, options)` dentro de un componente, o
 *   - `shortcuts.register({ id, combo, handler, ... })` desde cualquier lado.
 *
 * Ejemplos de combos: 'shift+tab', 'mod+shift+p', 'f2', 'escape', 'mod+k'.
 */

export { shortcuts } from './registry'
export { formatCombo } from './format'
export { useShortcut } from './useShortcut'
export { parseCombo, eventToCombo, isEditableTarget, IS_MAC } from './key'
export type { ShortcutAction, ParsedCombo, ShortcutModifier } from './types'
