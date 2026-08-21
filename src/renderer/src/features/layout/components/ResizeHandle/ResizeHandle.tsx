import {
  useCallback,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type PointerEvent
} from 'react'
import styles from './ResizeHandle.module.css'

interface ResizeHandleProps {
  /** Etiqueta accesible (nombre del panel que se redimensiona). */
  label: string
  /** Ancho actual en píxeles. */
  value: number
  min: number
  max: number
  /**
   * Dirección del drag: false = el ancho crece al arrastrar a la derecha
   * (borde derecho de un panel izquierdo); true = crece al arrastrar a la
   * izquierda (borde izquierdo de un panel derecho).
   */
  invert?: boolean
  onResize: (width: number) => void
}

const KEYBOARD_STEP = 20

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Handle de redimensionado entre paneles.
 * El área interactiva es delgada pero de alto completo (no se pierde área de
 * drag); la pista VISUAL es una cápsula corta y centrada verticalmente que
 * aparece al hover/foco/drag. Minimalista: sin glow, sin degradados, no toca
 * el borde superior ni inferior.
 */
export function ResizeHandle({
  label,
  value,
  min,
  max,
  invert = false,
  onResize
}: ResizeHandleProps): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      event.preventDefault()
      event.currentTarget.focus()
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Puntero ya liberado: se ignora.
      }
      dragRef.current = { startX: event.clientX, startWidth: value }
      setDragging(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [value]
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      const drag = dragRef.current
      if (!drag) return
      const delta = event.clientX - drag.startX
      onResize(clamp(drag.startWidth + (invert ? -delta : delta), min, max))
    },
    [invert, min, max, onResize]
  )

  const finishDrag = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    dragRef.current = null
    setDragging(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    // Al soltar, quitar el foco para que `:focus-visible` deje de matchear y
    // la cápsula se oculte. El teclado (Tab → flechas) sigue mostrándola.
    event.currentTarget.blur()
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onResize(clamp(value - KEYBOARD_STEP, min, max))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onResize(clamp(value + KEYBOARD_STEP, min, max))
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-dragging={dragging || undefined}
      className={styles.handle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.capsule} aria-hidden="true" />
    </div>
  )
}
