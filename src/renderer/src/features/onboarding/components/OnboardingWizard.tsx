/**
 * Wizard de configuración inicial — el ÚNICO pintor.
 *
 * Montado 1× en App (junto a los demás hosts). No conoce ningún paso
 * concreto: nav y contenido salen del registry. Reusa el primitivo `Modal`
 * (size 'xl') para no reimplementar overlay, foco atrapado ni Esc.
 *
 * Esc / click afuera / la X cierran = "omitir": se marca como visto y no se
 * vuelve a abrir solo (decisión de producto: preguntar de nuevo es más
 * intrusivo que útil). Se puede reabrir con el comando "Ver configuración
 * inicial" de la paleta.
 */

import type { JSX } from 'react'
import { Modal } from '@ui'
import { ProductIcon } from '@services/productIcons/components'
import { useOnboarding } from '../state/OnboardingContext'
import type { StepContext } from '../types'
import styles from './OnboardingWizard.module.css'

export function OnboardingWizard(): JSX.Element | null {
  const { visible, steps, current, progress, choices, next, back, goTo, finish, setChoice } =
    useOnboarding()

  if (!visible || !current) return null

  const Step = current.component
  const stepProps: StepContext = {
    next,
    back,
    finish,
    openStep: (stepId: string): void => {
      const index = steps.findIndex((step) => step.id === stepId)
      if (index >= 0) goTo(index)
    },
    choices,
    choice: choices[current.id] ?? null,
    setChoice: (value: string | null): void => setChoice(current.id, value)
  }

  return (
    <Modal open title="Configuración inicial" size="xl" onClose={finish}>
      <div className={styles.body}>
        <nav className={styles.nav} aria-label="Pasos de la configuración inicial">
          <div className={styles.brand}>
            <ProductIcon id="compass" size={16} aria-hidden="true" />
            <span className={styles.brandText}>Empecemos</span>
          </div>
          {steps.map((step, index) => {
            const mark = progress.marks[index]
            return (
              <button
                key={step.id}
                type="button"
                aria-current={mark === 'current' ? 'step' : undefined}
                className={[styles.navItem, mark === 'current' ? styles.navItemCurrent : null]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => goTo(index)}
              >
                <span className={styles.navIcon}>
                  {mark === 'visited' ? (
                    <ProductIcon id="check" size={13} aria-hidden="true" />
                  ) : (
                    <ProductIcon id={step.icon} size={13} aria-hidden="true" />
                  )}
                </span>
                <span className={styles.navLabel}>{step.label}</span>
              </button>
            )
          })}
          <div className={styles.navFoot}>
            <div className={styles.bar} aria-hidden="true">
              <span className={styles.barFill} style={{ width: `${progress.ratio * 100}%` }} />
            </div>
            <span className={styles.navCount}>
              {progress.current} de {progress.total}
            </span>
          </div>
        </nav>

        <div className={styles.main}>
          <header className={styles.head}>
            <div className={styles.headTop}>
              <span className={styles.iconChip}>
                <ProductIcon id={current.icon} size={15} aria-hidden="true" />
              </span>
              <span
                className={[
                  styles.kindBadge,
                  current.kind === 'fake' ? styles.kindFake : styles.kindReal
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {current.kind === 'fake' ? 'Vista previa' : 'Se aplica ahora'}
              </span>
            </div>
            <h2 className={styles.title}>{current.title}</h2>
            <p className={styles.subtitle}>{current.subtitle}</p>
          </header>

          <div className={styles.content}>
            <Step {...stepProps} />
          </div>

          <footer className={styles.footer}>
            <button type="button" className={styles.skip} onClick={finish}>
              Omitir configuración
            </button>
            <div className={styles.spacer} />
            <button
              type="button"
              className={styles.ghost}
              onClick={back}
              disabled={!progress.canBack}
            >
              Atrás
            </button>
            <button type="button" className={styles.primary} onClick={next}>
              {progress.isLast ? 'Empezar a usar Scrakk' : 'Siguiente'}
            </button>
          </footer>
        </div>
      </div>
    </Modal>
  )
}
