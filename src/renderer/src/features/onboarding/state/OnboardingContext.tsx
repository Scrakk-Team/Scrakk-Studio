/**
 * Estado del wizard de configuración inicial — provider + hook.
 *
 * PIEZAS:
 *  - La máquina pura (`state/machine.ts`) decide los saltos.
 *  - El registry (`registry.ts`) aporta los pasos (y avisa si cambian).
 *  - El storage central (`@services/storage`) persiste estatus y paso, así
 *    un cierre a mitad de camino se reanuda en el mismo lugar.
 *
 * NO hay reloj ni efectos raros: cada transición (`next`/`back`/`goTo`/
 * `finish`) persiste lo suyo de forma explícita. `choices` (lo elegido en
 * cada paso) vive en memoria: los pasos REALES ya persisten su propia
 * decisión (el tema en su store, la telemetría en storage); los fake son
 * maqueta y no tienen a dónde persistir.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode
} from 'react'
import { commandRegistry } from '@services/commands'
import {
  getPersistedOnboardingStatus,
  getPersistedOnboardingStep,
  persistOnboardingStatus,
  persistOnboardingStep
} from '@services/storage'
import { subscribeToOnboardingSteps, getOnboardingStepIds, getOnboardingStepById } from '../registry'
import {
  back as machineBack,
  finish as machineFinish,
  goTo as machineGoTo,
  initialState,
  next as machineNext,
  progressOf,
  reopen as machineReopen,
  shouldShow,
  withSteps,
  type WizardProgress,
  type WizardState
} from './machine'
import type { OnboardingStep } from '../types'

/** Id del comando de la paleta que vuelve a abrir esta pantalla. */
export const ONBOARDING_COMMAND_ID = 'onboarding.open'
/** Key de dev para reseteo manual (útil mientras la pantalla es maqueta). */
export const ONBOARDING_RESET_EVENT = 'onboarding:reset'

interface OnboardingContextValue {
  /** ¿Se está mostrando el wizard ahora? */
  visible: boolean
  steps: OnboardingStep[]
  current: OnboardingStep | null
  progress: WizardProgress
  choices: Readonly<Record<string, string | null>>
  next: () => void
  back: () => void
  goTo: (index: number) => void
  finish: () => void
  /** Reabre desde el paso 0 (sin borrar las elecciones ya aplicadas). */
  reopen: () => void
  setChoice: (stepId: string, value: string | null) => void
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

function readState(): WizardState {
  return initialState(
    getOnboardingStepIds(),
    getPersistedOnboardingStatus(),
    getPersistedOnboardingStep()
  )
}

export function OnboardingProvider({ children }: { children: ReactNode }): JSX.Element {
  const [wizard, setWizard] = useState<WizardState>(readState)
  const [choices, setChoices] = useState<Record<string, string | null>>({})

  // Los pasos pueden llegar después (builtin registrándose) o cambiar en
  // runtime (un paso de extensión). Reconciliamos índices y reordenamos.
  useEffect(() => {
    const sync = (): void => setWizard((prev) => withSteps(prev, getOnboardingStepIds()))
    sync()
    return subscribeToOnboardingSteps(sync)
  }, [])

  // Comando global para reabrirla (paleta). Reabrir no borra nada: el paso 0
  // vuelve a mostrar lo ya aplicado como estado actual.
  useEffect(() => {
    return commandRegistry.register(
      {
        id: ONBOARDING_COMMAND_ID,
        title: 'Ver configuración inicial',
        category: 'General',
        run: () => setWizard((prev) => machineReopen(prev))
      },
      { allowOverwrite: true }
    )
  }, [])

  const next = useCallback((): void => {
    setWizard((prev) => {
      const result = machineNext(prev)
      persistOnboardingStatus(result.status)
      persistOnboardingStep(result.index)
      return result
    })
  }, [])

  const back = useCallback((): void => {
    setWizard((prev) => {
      const result = machineBack(prev)
      persistOnboardingStep(result.index)
      return result
    })
  }, [])

  const goTo = useCallback((index: number): void => {
    setWizard((prev) => {
      const result = machineGoTo(prev, index)
      persistOnboardingStep(result.index)
      return result
    })
  }, [])

  const finish = useCallback((): void => {
    setWizard((prev) => {
      const result = machineFinish(prev)
      persistOnboardingStatus(result.status)
      persistOnboardingStep(result.index)
      return result
    })
  }, [])

  const reopen = useCallback((): void => {
    setWizard((prev) => {
      const result = machineReopen(prev)
      persistOnboardingStatus(result.status)
      persistOnboardingStep(result.index)
      return result
    })
  }, [])

  const setChoice = useCallback((stepId: string, value: string | null): void => {
    setChoices((prev) => (prev[stepId] === value ? prev : { ...prev, [stepId]: value }))
  }, [])

  const steps = useMemo<OnboardingStep[]>(
    () => wizard.steps.map((id) => getOnboardingStepById(id)).filter((s): s is OnboardingStep => s !== null),
    [wizard.steps]
  )

  const value = useMemo<OnboardingContextValue>(() => {
    const current = wizard.steps.length === 0 ? null : steps[wizard.index] ?? null
    return {
      visible: shouldShow(wizard),
      steps,
      current,
      progress: progressOf(wizard),
      choices,
      next,
      back,
      goTo,
      finish,
      reopen,
      setChoice
    }
  }, [wizard, steps, choices, next, back, goTo, finish, reopen, setChoice])

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding fuera de <OnboardingProvider>')
  return ctx
}
