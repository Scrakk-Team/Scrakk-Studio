// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Chords — máquina de estados para atajos en SECUENCIA.
 *
 * Un chord son dos combinaciones seguidas (`Ctrl+K` y después `Ctrl+S`), no una
 * combinación con más teclas. VS Code los usa mucho (`Ctrl+K Ctrl+S` abre los
 * atajos, `Ctrl+K Ctrl+W` cierra todo).
 *
 * El motor recibe un `keydown` por vez, así que la secuencia se resuelve con
 * estado "pendiente": si lo apretado es el comienzo de un chord se espera la
 * siguiente combinación (con timeout) en vez de ejecutar algo.
 *
 * Puro y sin DOM a propósito: se testea entero sin navegador.
 */

export interface ChordStep {
  /** Combo completo a ejecutar (null = todavía no hay nada que correr). */
  run: string | null
  /** true = quedó esperando la siguiente parte del chord. */
  wait: boolean
}

export class ChordTracker {
  private pending: string | null = null

  /** Combo que está esperando la segunda parte (para diagnósticos/UI). */
  get pendingCombo(): string | null {
    return this.pending
  }

  /**
   * Avanza con el combo recién presionado.
   *
   * @param combo      combo canónico del evento ('ctrl+k')
   * @param has        ¿hay acciones registradas para este combo completo?
   * @param isPrefix   ¿este combo es el comienzo de algún chord?
   */
  push(combo: string, has: (candidate: string) => boolean, isPrefix: (candidate: string) => boolean): ChordStep {
    const candidate = this.pending ? `${this.pending} ${combo}` : combo

    // Completó un chord (o es una combinación simple).
    if (has(candidate)) {
      this.pending = null
      return { run: candidate, wait: false }
    }

    // Es el comienzo de un chord: se espera la siguiente combinación.
    if (isPrefix(candidate)) {
      this.pending = candidate
      return { run: null, wait: true }
    }

    // Ni acción ni prefijo: se cancela lo pendiente (una secuencia inválida no
    // ejecuta nada; es el mismo criterio que VS Code).
    this.pending = null
    return { run: null, wait: false }
  }

  /** Timeout o desenfoque de ventana: se descarta la secuencia a medias. */
  reset(): void {
    this.pending = null
  }
}
