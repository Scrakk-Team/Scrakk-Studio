/**
 * Máquina de estados PURA del wizard de configuración inicial.
 *
 * Sin React, sin storage, sin I/O: entra un estado y una lista de ids de
 * pasos, sale el estado siguiente. Así el avance/retroceso/reanudación se
 * testea entero sin montar nada (tests/onboarding.test.ts).
 *
 * Estados:
 *   'running' → el wizard se muestra (primer arranque o reabierto a mano).
 *   'done'    → terminado u omitido: no se vuelve a mostrar solo.
 *
 * `visited` es el índice más alto alcanzado: el nav lo usa para marcar los
 * pasos ya vistos, y sobrevive a un cierre a mitad de camino.
 */

import type { OnboardingStatus } from '@services/storage'

export interface WizardState {
  /** Ids de los pasos visibles, en orden. */
  steps: readonly string[]
  /** Índice del paso actual. */
  index: number
  /** Índice más alto alcanzado (para el nav y el resumen). */
  visited: number
  status: OnboardingStatus
}

/** Sanea un índice crudo (storage, clics, etc.) contra el total de pasos. */
export function clampIndex(index: unknown, total: number): number {
  if (total <= 0) return 0
  const value = typeof index === 'number' && Number.isFinite(index) ? Math.floor(index) : 0
  if (value < 0) return 0
  if (value > total - 1) return total - 1
  return value
}

/**
 * Estado inicial. `status` ausente = primer arranque → 'running' en el paso
 * guardado (0 si nunca se guardó uno).
 */
export function initialState(
  steps: readonly string[],
  status: OnboardingStatus | null = null,
  index: number | null = null
): WizardState {
  const resolved = status ?? 'running'
  const at = clampIndex(index, steps.length)
  return { steps, index: at, visited: at, status: resolved }
}

/** Reajusta el estado cuando cambia la lista de pasos (altas/bajas en runtime). */
export function withSteps(state: WizardState, steps: readonly string[]): WizardState {
  const index = clampIndex(state.index, steps.length)
  return {
    ...state,
    steps,
    index,
    visited: clampIndex(Math.max(state.visited, index), steps.length)
  }
}

/** Va a un índice concreto (clic en el nav). Marca el paso como visitado. */
export function goTo(state: WizardState, index: number): WizardState {
  const at = clampIndex(index, state.steps.length)
  return { ...state, index: at, visited: Math.max(state.visited, at) }
}

/**
 * Avanza. En el último paso el wizard se CIERRA (status 'done'): llegar al
 * final con "Empezar a usar Scrakk" es la única forma de terminar por
 * avance; retroceder desde el final no cierra nada.
 */
export function next(state: WizardState): WizardState {
  if (state.status !== 'running') return state
  if (state.steps.length === 0) return finish(state)
  if (state.index >= state.steps.length - 1) return finish(state)
  return goTo(state, state.index + 1)
}

/** Retrocede (no-op en el primero). */
export function back(state: WizardState): WizardState {
  if (state.index <= 0) return state
  return { ...state, index: state.index - 1 }
}

/** Cierra el wizard (terminado u omitido). Es idempotente. */
export function finish(state: WizardState): WizardState {
  if (state.status === 'done') return state
  return { ...state, status: 'done' }
}

/** Reabrir a mano (comando de la paleta): vuelve al paso 0 en 'running'. */
export function reopen(state: WizardState): WizardState {
  return { steps: state.steps, index: 0, visited: Math.max(state.visited, 0), status: 'running' }
}

export interface WizardProgress {
  /** Paso actual contando desde 1 (0 si no hay pasos). */
  current: number
  total: number
  /** 0..1 para la barra/dots. */
  ratio: number
  canBack: boolean
  isLast: boolean
  /** Estado de cada paso para el nav: visto, actual o pendiente. */
  marks: readonly ('current' | 'visited' | 'pending')[]
}

/** Vista derivada que consume el shell (pura y testeable). */
export function progressOf(state: WizardState): WizardProgress {
  const total = state.steps.length
  const current = total === 0 ? 0 : Math.min(state.index, total - 1) + 1
  const marks = state.steps.map((_, i) => {
    if (i === state.index) return 'current'
    if (i <= state.visited) return 'visited'
    return 'pending'
  })
  return {
    current,
    total,
    ratio: total === 0 ? 0 : current / total,
    canBack: state.index > 0,
    isLast: total > 0 && state.index >= total - 1,
    marks
  }
}

/** ¿Hay que mostrar el wizard ahora? */
export function shouldShow(state: WizardState): boolean {
  return state.status === 'running' && state.steps.length > 0
}
