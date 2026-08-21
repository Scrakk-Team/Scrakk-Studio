/**
 * Sistema de shortcuts — tipos.
 *
 * API pública que otros módulos usan para registrar atajos de teclado:
 * `shortcuts.register(...)` (no-React) o el hook `useShortcut(...)`.
 *
 * Formato de combo: teclas separadas por '+', en cualquier orden y
 * mayúsculas:
 *   - Modificadores: `ctrl`, `alt`, `shift`, `meta` y `mod` (= ctrl en
 *     Windows/Linux, meta en macOS).
 *   - Tecla principal: letras, números, símbolos, F1–F24, flechas
 *     (`arrowup`/`up`, `arrowdown`/`down`, ...), `enter`, `tab`, `escape`
 *     (`esc`), `space` (` `), `backspace` (`del`), `delete`, `home`, `end`,
 *     `pageup` (`pgup`), `pagedown` (`pgdn`), `insert` (`ins`), `capslock`.
 * Ejemplos: `'shift+tab'`, `'mod+shift+p'`, `'ctrl+alt+f12'`, `'f2'`,
 * `'escape'`, `'mod+k'`.
 */

export interface ShortcutAction {
  /** Id único (para re-registros y debug). */
  id: string
  /** Combo tipo 'shift+tab'. */
  combo: string
  /** Descripción humana (panel de atajos, logs). */
  description?: string
  handler: (event: KeyboardEvent) => void
  /** Evita el comportamiento por defecto del navegador (ej. Tab mueve foco). */
  preventDefault?: boolean
  /** Prioridad ante conflictos del mismo combo (mayor primero). */
  priority?: number
  /** Si true, el atajo también dispara dentro de inputs/textarea (default: no para combos sin modificador). */
  allowInInput?: boolean
}

export type ShortcutModifier = 'ctrl' | 'alt' | 'shift' | 'meta'

/** Combo parseado a forma canónica para matchear. */
export interface ParsedCombo {
  /** Forma canónica: modificadores ordenados + tecla, ej. 'shift+tab'. */
  combo: string
  modifiers: Set<ShortcutModifier>
  key: string
}
