// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Pasos builtin de la configuración inicial.
 *
 * Este archivo es el ÚNICO que conoce el orden y el catálogo completo: cada
 * paso vive en su carpeta, sabe pintarse solo y declara si es real o fake.
 * Agregar un paso = crear el componente y sumar una entrada aquí; el wizard
 * no cambia (se re-ordena solo por `order`).
 *
 * Fake = maqueta con datos de mentira, SIN servicios reales (tests/onboarding
 * .test.ts lee los imports de `steps/fake/**` y falla si alguno toca un
 * servicio). Real = aplica de verdad lo que el usuario elige.
 */

import { registerOnboardingStep } from '../registry'
import type { OnboardingStep } from '../types'
import { KeymapStep } from './fake/KeymapStep'
import { ReadyStep } from './fake/ReadyStep'
import { WelcomeStep } from './fake/WelcomeStep'
import { PrivacyStep } from './real/PrivacyStep'
import { ThemeStep } from './real/ThemeStep'

/** Catálogo de pasos, en orden de aparición. */
export const BUILTIN_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    label: 'Bienvenida',
    title: 'Bienvenido a Scrakk Studio',
    subtitle: 'Un editor con layout libre, terminal real y un ecosistema de extensiones.',
    icon: 'home',
    kind: 'fake',
    order: 10,
    component: WelcomeStep
  },
  {
    id: 'theme',
    label: 'Apariencia',
    title: 'Elige cómo se ve',
    subtitle: 'Los temas se aplican al instante y quedan guardados.',
    icon: 'grid',
    kind: 'real',
    order: 20,
    component: ThemeStep
  },
  {
    id: 'privacy',
    label: 'Privacidad',
    title: 'Tú decides qué se comparte',
    subtitle: 'Una sola vez, sin insistir: se cambia cuando quieras desde Ajustes.',
    icon: 'shield-check',
    kind: 'real',
    order: 30,
    component: PrivacyStep
  },
  {
    id: 'keymap',
    label: 'Atajos',
    title: 'Atajos a tu manera',
    subtitle: 'Si vienes de otro editor, arrancá con sus combinaciones.',
    icon: 'keyboard',
    kind: 'fake',
    order: 40,
    component: KeymapStep
  },
  {
    id: 'ready',
    label: 'Listo',
    title: 'Todo listo',
    subtitle: 'Revisa lo elegido o empieza a usar Scrakk.',
    icon: 'check',
    kind: 'fake',
    order: 50,
    component: ReadyStep
  }
]

let registered = false

/** Idempotente: registra el catálogo builtin una sola vez. */
export function registerBuiltinOnboardingSteps(): void {
  if (registered) return
  registered = true
  for (const step of BUILTIN_ONBOARDING_STEPS) registerOnboardingStep(step)
}

registerBuiltinOnboardingSteps()
