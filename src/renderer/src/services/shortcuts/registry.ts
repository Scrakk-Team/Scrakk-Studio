// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sistema de shortcuts — registry + listener global.
 *
 * El singleton `shortcuts` se crea al importar y escucha `keydown` en la
 * ventana. Cada acción se registra por su combo canónico; ante el mismo
 * combo, se ejecutan en orden de prioridad (mayor primero). Los combos SIN
 * modificador (ej. 'f2') no disparan dentro de inputs/textarea salvo que la
 * acción declare `allowInInput: true`.
 */

import { eventToCombo, isEditableTarget, parseComboSpec } from './key'
import { ChordTracker } from './chords'
import type { ParsedCombo, ShortcutAction } from './types'

/** Cuánto se espera la segunda parte de un chord (`Ctrl+K`, después `Ctrl+S`). */
const CHORD_TIMEOUT_MS = 1200

class ShortcutRegistry {
  /** combo canónico (o chord `'a b'`) → acciones registradas (por prioridad). */
  private actions = new Map<string, ShortcutAction[]>()
  private parsedCombos = new Map<string, ParsedCombo>()
  /** Estado de las secuencias en curso. */
  private chords = new ChordTracker()
  private chordTimer: ReturnType<typeof setTimeout> | null = null
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null

  /**
   * Registra una acción. Devuelve una función para desregistrarla.
   */
  register(action: ShortcutAction): () => void {
    // `parseComboSpec` acepta combinaciones simples Y chords ('ctrl+k ctrl+s').
    const spec = parseComboSpec(action.combo)
    this.parsedCombos.set(spec.combo, spec.segments[spec.segments.length - 1])

    const list = this.actions.get(spec.combo) ?? []
    list.push(action)
    list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    this.actions.set(spec.combo, list)

    this.ensureListener()
    return () => this.unregister(action.id, spec.combo)
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
      return this.actions.has(parseComboSpec(combo).combo)
    } catch {
      return false
    }
  }

  /** ¿Combo es el comienzo de algún chord registrado? ('ctrl+k' → 'ctrl+k x'). */
  private isChordPrefix(combo: string): boolean {
    for (const key of this.actions.keys()) {
      if (key.startsWith(`${combo} `)) return true
    }
    return false
  }

  private armChordTimeout(): void {
    if (this.chordTimer) clearTimeout(this.chordTimer)
    this.chordTimer = setTimeout(() => {
      this.chords.reset()
      this.chordTimer = null
    }, CHORD_TIMEOUT_MS)
  }

  /** ¿Existe alguna acción registrada con este id? (tests/diagnostics). */
  hasActionId(actionId: string): boolean {
    for (const actions of this.actions.values()) {
      if (actions.some((action) => action.id === actionId)) return true
    }
    return false
  }

  getAll(): Array<{ combo: string; actions: ShortcutAction[] }> {
    return [...this.actions.entries()]
      .map(([combo, actions]) => ({ combo, actions }))
      .sort((a, b) => a.combo.localeCompare(b.combo))
  }

  private ensureListener(): void {
    if (this.keydownHandler) return
    // Sin DOM (tests en node): registrar acciones funciona, el listener
    // se conectará cuando exista window.
    if (typeof window === 'undefined') return
    this.keydownHandler = (event: KeyboardEvent): void => {
      if (event.repeat) return
      const combo = eventToCombo(event)
      if (!combo) return

      // Chords: si lo apretado es el comienzo de una secuencia, se espera la
      // segunda parte (con timeout) en vez de ejecutar un atajo simple.
      const step = this.chords.push(
        combo,
        (candidate) => (this.actions.get(candidate)?.length ?? 0) > 0,
        (candidate) => this.isChordPrefix(candidate)
      )
      if (step.wait) {
        this.armChordTimeout()
        event.preventDefault()
        return
      }
      if (this.chordTimer) {
        clearTimeout(this.chordTimer)
        this.chordTimer = null
      }
      if (!step.run) return

      const list = this.actions.get(step.run)
      if (!list || list.length === 0) return

      const inInput = isEditableTarget(event)
      for (const action of list) {
        // Combos sin modificador no se tragan la escritura en campos. En un
        // chord manda la ÚLTIMA combinación (la que completa la secuencia).
        const spec = parseComboSpec(action.combo)
        const modifiers = spec.segments[spec.segments.length - 1].modifiers.size
        if (inInput && !action.allowInInput && modifiers === 0) {
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
