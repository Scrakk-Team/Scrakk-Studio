/**
 * Feature Configuración inicial — API pública del módulo.
 *
 * Uso (App):
 *   import { OnboardingProvider, OnboardingWizard } from '@features/onboarding'
 *   <OnboardingProvider>…<OnboardingWizard /></OnboardingProvider>
 *
 * El wizard se muestra solo si corresponde (primer arranque o reabierto con
 * el comando "Ver configuración inicial" de la paleta). Todo lo demás —pasos,
 * orden, nav, resumen— sale del registry.
 *
 * IMPORTANTE: este import registra los pasos builtin (efecto de módulo, igual
 * que el ToolDock con sus items). Si alguien importa el provider por ruta
 * directa, se queda sin pasos.
 */

export { OnboardingProvider, useOnboarding, ONBOARDING_COMMAND_ID } from './state/OnboardingContext'
export { OnboardingWizard } from './components/OnboardingWizard'
export {
  registerOnboardingStep,
  unregisterOnboardingStep,
  subscribeToOnboardingSteps,
  getOnboardingSteps,
  getOnboardingStepIds,
  getOnboardingStepById
} from './registry'
// Re-exportar `./steps` ya lo ejecuta: el catálogo builtin queda registrado
// como efecto de importar este barrel.
export { BUILTIN_ONBOARDING_STEPS, registerBuiltinOnboardingSteps } from './steps'
export type { OnboardingStep, StepContext, StepKind } from './types'
