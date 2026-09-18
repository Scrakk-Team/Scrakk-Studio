/**
 * Pantalla de configuración inicial — registro de pasos.
 *
 * Mismo patrón que el resto de los registry del repo (Map + Set<Listener> +
 * emit). Los pasos builtin se registran desde `steps/index.ts`; el orden es
 * el `order` declarado por cada paso (empate → id, para que sea estable).
 *
 * Un paso nuevo = crear su componente y registrarlo. El wizard no cambia.
 */

import type { OnboardingStep } from './types'

type Listener = () => void

const steps = new Map<string, OnboardingStep>()
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no tumba a los demás.
    }
  }
}

/** Registra (o reemplaza) un paso. Devuelve la baja. */
export function registerOnboardingStep(step: OnboardingStep): () => void {
  steps.set(step.id, step)
  emit()
  return () => unregisterOnboardingStep(step.id)
}

export function unregisterOnboardingStep(id: string): void {
  if (steps.delete(id)) emit()
}

export function subscribeToOnboardingSteps(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Pasos ordenados por `order` (default 100) y, a igual orden, por id. */
export function getOnboardingSteps(): OnboardingStep[] {
  return [...steps.values()].sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id)
  )
}

/** Ids en orden — lo que persiste/consume la máquina de estados. */
export function getOnboardingStepIds(): string[] {
  return getOnboardingSteps().map((step) => step.id)
}

export function getOnboardingStepById(id: string): OnboardingStep | null {
  return steps.get(id) ?? null
}

/** Solo tests: limpia memoria + listeners. */
export function _resetOnboardingRegistryForTests(): void {
  steps.clear()
  listeners.clear()
}
