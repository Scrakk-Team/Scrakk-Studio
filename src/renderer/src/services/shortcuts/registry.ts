/**
 * Sistema de shortcuts — registry + listener global.
 *
 * El singleton `shortcuts` se crea al importar y escucha `keydown` en la
 * ventana. Cada acción se registra por su combo canónico; ante el mismo
 * combo, se ejecutan en orden de prioridad (mayor primero). Los combos SIN
 * modificador (ej. 'f2') no disparan dentro de inputs/textarea salvo que la
 * acción declare `allowInInput: true`.
 */

import { eventToCombo, isEditableTarget, parseCombo } from './key'
import type { ParsedCombo, ShortcutAction } from './types'

class ShortcutRegistry {
  /** combo canónico → acciones registradas (ordenadas por prioridad). */
  private actions = new Map<string, ShortcutAction[]>()
  private parsedCombos = new Map<string, ParsedCombo>()
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null

  /**
   * Registra una acción. Devuelve una función para desregistrarla.
   */
  register(action: ShortcutAction): () => void {
    const parsed = parseCombo(action.combo)
    this.parsedCombos.set(parsed.combo, parsed)

    const list = this.actions.get(parsed.combo) ?? []
    list.push(action)
    list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    this.actions.set(parsed.combo, list)

    this.ensureListener()
    return () => this.unregister(action.id, parsed.combo)
  }

  unregister(id: string, combo?: string): void {
    for (const [canonical, list] of this.actions) {
      if (combo && canonical !== combo) continue
      const next = list.filter((action) => action.id !== id)
      if (next.length === 0) this.actions.delete(canonical)
      else this.actions.set(canonical, next)
    }
  }

  has(combo: string): boolean {
    try {
      return this.actions.has(parseCombo(combo).combo)
    } catch {
      return false
    }
  }

  getAll(): Array<{ combo: string; actions: ShortcutAction[] }> {
    return [...this.actions.entries()]
      .map(([combo, actions]) => ({ combo, actions }))
      .sort((a, b) => a.combo.localeCompare(b.combo))
  }

  private ensureListener(): void {
    if (this.keydownHandler) return
    this.keydownHandler = (event: KeyboardEvent): void => {
      if (event.repeat) return
      const combo = eventToCombo(event)
      if (!combo) return
      const list = this.actions.get(combo)
      if (!list || list.length === 0) return

      const inInput = isEditableTarget(event)
      for (const action of list) {
        // Combos sin modificador no se tragan la escritura en campos.
        if (inInput && !action.allowInInput && parseCombo(action.combo).modifiers.size === 0) {
          continue
        }
        action.handler(event)
        if (action.preventDefault) event.preventDefault()
      }
    }
    window.addEventListener('keydown', this.keydownHandler)
  }
}

/** Singleton global del sistema de shortcuts. */
export const shortcuts = new ShortcutRegistry()
