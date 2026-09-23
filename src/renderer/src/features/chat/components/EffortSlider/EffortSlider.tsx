/**
 * EffortSlider — barra slideable de esfuerzo de razonamiento.
 *
 * Extraído del selector de effort de PromptBar (React Bits): SOLO la barra
 * (head + ends + track con fill/dots/thumb), sin input ni el resto. Se usa como
 * menú custom del selector de "pensamiento" del input de chat.
 */

import {
  useRef,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
  type PointerEvent
} from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { HelpCircleIcon } from '@hugeicons/core-free-icons'
import styles from './EffortSlider.module.css'

/** Margen de los extremos de la pista (px), igual que PromptBar. */
const EDGE = 11

export interface EffortSliderProps {
  /** Pasos, de menor a mayor esfuerzo. */
  steps: string[]
  /** Valor actual. `''` = automática (sin paso elegido). */
  value: string
  /** Se llama al soltar/mover la barra. */
  onChange: (value: string) => void
  /** Si viene, muestra el reset a "Automática". */
  onAuto?: () => void
  title?: string
  ariaLabel?: string
}

export function EffortSlider({
  steps,
  value,
  onChange,
  onAuto,
  title = 'Pensamiento',
  ariaLabel = 'Esfuerzo'
}: EffortSliderProps): JSX.Element {
  const indexOf = steps.indexOf(value)
  const index = indexOf >= 0 ? indexOf : Math.max(0, Math.floor((steps.length - 1) / 2))
  const level = indexOf >= 0 ? value : 'Automática'
  const maxed = steps.length > 1 && indexOf === steps.length - 1
  const trackRef = useRef<HTMLDivElement>(null)

  const setIndex = (next: number): void => {
    const clamped = Math.max(0, Math.min(steps.length - 1, next))
    if (clamped === indexOf) return
    onChange(steps[clamped])
  }

  const fromPointer = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const k = (event.clientX - rect.left - EDGE) / Math.max(1, rect.width - EDGE * 2)
    setIndex(Math.round(k * (steps.length - 1)))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0
    if (step) {
      event.preventDefault()
      setIndex(index + step)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setIndex(steps.length - 1)
    }
  }

  const stepAt = (i: number): string =>
    `calc(${EDGE}px + (100% - ${EDGE * 2}px) * ${i / Math.max(1, steps.length - 1)})`
  const fillAt = (i: number): string =>
    i === steps.length - 1 ? '100%' : `calc(${stepAt(i)} + 7px)`

  return (
    <div className={styles.slider} data-max={maxed ? '' : undefined}>
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
        <span className={styles.level}>{level}</span>
        <span className={styles.headRight}>
          {onAuto ? (
            <button type="button" className={styles.auto} onClick={onAuto}>
              Auto
            </button>
          ) : null}
          <span
            className={styles.help}
            title="Más esfuerzo = piensa más antes de responder"
          >
            <HugeiconsIcon icon={HelpCircleIcon} size={14} strokeWidth={1.8} />
          </span>
        </span>
      </div>

      <div className={styles.ends}>
        <span>Rápido</span>
        <span>Profundo</span>
      </div>

      <div
        ref={trackRef}
        className={styles.track}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={steps.length - 1}
        aria-valuenow={index}
        aria-valuetext={level}
        style={
          {
            '--effort-x': stepAt(index),
            '--effort-fill': fillAt(index)
          } as CSSProperties
        }
        onPointerDown={(event) => {
          if (event.button !== 0) return
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            // puntero ya liberado
          }
          event.currentTarget.focus({ preventScroll: true })
          fromPointer(event)
        }}
        onPointerMove={(event) => {
          if (event.buttons & 1) fromPointer(event)
        }}
        onKeyDown={onKeyDown}
      >
        <span className={styles.fill} />
        {steps.map((label, i) => (
          <i key={label} className={styles.dot} style={{ left: stepAt(i) }} />
        ))}
        <span className={styles.thumb} />
      </div>
    </div>
  )
}
