import {
  useCallback,
  useEffect,
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
  /** Ancho/Alto actual en píxeles. */
  value: number
  min: number
  max: number
  /**
   * Dirección del drag: false = el tamaño crece al arrastrar a la derecha/abajo
   * (borde derecho/inferior); true = crece al arrastrar a la izquierda/arriba.
   */
  invert?: boolean
  /** Orientación: vertical = resiza ancho (col-resize), horizontal = resiza alto (row-resize). */
  direction?: 'vertical' | 'horizontal'
  /** Paso del teclado (píxeles; para ratios, usar fracción p.ej. 0.05). */
  step?: number
  /**
   * Cápsula CUADRADA (sin redondeo): la usa el SplitView — la separación
   * entre lados de un split es idéntica a la de los paneles, solo que sin
   * el redondeo de las tarjetas exteriores.
   */
  square?: boolean
  onResize: (width: number) => void
  /**
   * Commit diferido: si se pasa, el drag NO llama onResize por evento —
   * escribe vía `onLive` (DOM directo, 1 vez por frame) y llama onCommit
   * UNA vez al soltar, con el valor final ya clampado. onResize queda para
   * teclado y para el path live cuando no hay onCommit.
   */
  onCommit?: (width: number) => void
  /**
   * Movimiento en vivo SIN React: se llama como máximo 1 vez por frame con
   * el valor clampado. El padre escribe estilos directo en el DOM (refs) —
   * cero setState durante el drag, cero re-renders, el contenido sigue al
   * cursor en tiempo real. Al soltar, `onCommit` sincroniza el estado.
   */
  onLive?: (width: number) => void
}

const KEYBOARD_STEP = 20

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Valor del drag en píxeles (slots externos): startValue ± delta.
 * Pura (testeable): sin DOM.
 */
export function dragPxValue(
  startValue: number,
  startClient: number,
  client: number,
  invert: boolean,
  min: number,
  max: number
): number {
  const delta = client - startClient
  return clamp(startValue + (invert ? -delta : delta), min, max)
}

/**
 * Valor del drag como fracción del contenedor (splits, 0..1): una sola
 * medición del contenedor al iniciar, después pura aritmética (sin lecturas
 * de layout por frame, que es lo que traba el drag en PCs malas).
 * Pura (testeable): sin DOM.
 */
export function dragRatioValue(
  client: number,
  containerStart: number,
  containerSize: number,
  min: number,
  max: number
): number {
  if (containerSize <= 0) return min
  return clamp((client - containerStart) / containerSize, min, max)
}

/** Estado del drag guardado en ref (nunca en React state). */
interface DragState {
  /** true = píxeles (slots externos), false = fracción 0..1 (splits). */
  isPx: boolean
  startValue: number
  startClient: number
  /** Origen y tamaño del contenedor (una sola medición al iniciar). */
  containerStart: number
  containerSize: number
  pendingClient: number
  pendingValue: number
  moved: boolean
}

/**
 * Handle de redimensionado entre paneles.
 * El área interactiva es delgada pero de alto completo (no se pierde área de
 * drag); la pista VISUAL es:
 * - hover/foco: 3 puntos (color del tema).
 * - drag (presionado): cápsula corta y centrada.
 * Minimalista: sin glow, sin degradados, no toca bordes.
 */
export function ResizeHandle({
  label,
  value,
  min,
  max,
  invert = false,
  direction = 'vertical',
  step = KEYBOARD_STEP,
  square = false,
  onResize,
  onCommit,
  onLive
}: ResizeHandleProps): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const isHorizontal = direction === 'horizontal'
  const isRatio = max <= 1
  // Heurística existente: ratios viven en 0..1, píxeles no.
  const isPx = !isRatio
  const dragRef = useRef<{ start: number; startValue: number } | null>(null)
  const liveRef = useRef<DragState | null>(null)
  const rafRef = useRef<number | null>(null)

  const cancelRaf = useCallback((): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  // Cancela el RAF si el componente se desmonta en pleno drag (y suelta el
  // cursor del body para que no quede pegado).
  useEffect(
    () => () => {
      cancelRaf()
      liveRef.current = null
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    },
    [cancelRaf]
  )

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      event.preventDefault()
      event.currentTarget.focus()
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Puntero ya liberado: se ignora.
      }
      const startClient = isHorizontal ? event.clientY : event.clientX
      dragRef.current = { start: startClient, startValue: value }
      // Medición ÚNICA al iniciar (rect del contenedor para ratios).
      // Después, pura aritmética: cero lecturas de layout durante el drag.
      if (onCommit) {
        const parent = event.currentTarget.parentElement?.getBoundingClientRect()
        const p = parent ?? event.currentTarget.getBoundingClientRect()
        liveRef.current = {
          isPx,
          startValue: value,
          startClient,
          containerStart: isHorizontal ? p.top : p.left,
          containerSize: isHorizontal ? p.height : p.width,
          pendingClient: startClient,
          pendingValue: value,
          moved: false
        }
      }
      setDragging(true)
      document.body.style.cursor = isHorizontal ? 'row-resize' : 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [value, isHorizontal, isPx, onCommit]
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      const drag = dragRef.current
      if (!drag) return
      const current = isHorizontal ? event.clientY : event.clientX
      // Con onCommit: solo se guarda la última posición; un RAF por frame
      // escribe vía onLive (DOM directo, last-write-wins) — cero React.
      const live = liveRef.current
      if (live && onCommit) {
        live.pendingClient = current
        live.moved = true
        if (rafRef.current !== null) return
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          const g = liveRef.current
          if (!g) return
          g.pendingValue = g.isPx
            ? dragPxValue(g.startValue, g.startClient, g.pendingClient, invert, min, max)
            : dragRatioValue(g.pendingClient, g.containerStart, g.containerSize, min, max)
          onLive?.(g.pendingValue)
        })
        return
      }
      const delta = current - drag.start
      onResize(clamp(drag.startValue + (invert ? -delta : delta), min, max))
    },
    [invert, min, max, onResize, onCommit, onLive, isHorizontal]
  )

  const finishDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      // Commit ÚNICO al soltar: un solo setState/emit en vez de ~60/s.
      // Sin movimiento no hay commit (evita re-renders y writes inútiles).
      const live = liveRef.current
      if (live && onCommit) {
        cancelRaf()
        if (live.moved) {
          const finalValue = live.isPx
            ? dragPxValue(live.startValue, live.startClient, live.pendingClient, invert, min, max)
            : dragRatioValue(
                live.pendingClient,
                live.containerStart,
                live.containerSize,
                min,
                max
              )
          if (finalValue !== live.startValue) onCommit(finalValue)
        }
        liveRef.current = null
      }
      dragRef.current = null
      setDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Al soltar, quitar el foco para que `:focus-visible` deje de matchear y
      // la cápsula se oculte. El teclado (Tab → flechas) sigue mostrándola.
      event.currentTarget.blur()
    },
    [onCommit, invert, min, max, cancelRaf]
  )

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Teclado = commit directo por pulsación (baja frecuencia, sin drag):
    // usa onCommit cuando existe para no pasar por el path live.
    const commit = onCommit ?? onResize
    const delta = step
    if (isHorizontal) {
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        commit(clamp(value - delta, min, max))
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        commit(clamp(value + delta, min, max))
      }
    } else {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        commit(clamp(value - delta, min, max))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        commit(clamp(value + delta, min, max))
      }
    }
  }

  return (
    <div
      role="separator"
      aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
      aria-label={label}
      aria-valuenow={isRatio ? Math.round(value * 100) : Math.round(value)}
      aria-valuemin={isRatio ? Math.round(min * 100) : min}
      aria-valuemax={isRatio ? Math.round(max * 100) : max}
      tabIndex={0}
      data-dragging={dragging || undefined}
      data-direction={direction}
      data-square={square || undefined}
      className={styles.handle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.dots} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className={styles.capsule} aria-hidden="true" />
    </div>
  )
}

interface CornerResizeHandleProps {
  /** Etiqueta accesible. */
  label: string
  /** 'left' = cursor ↘↖, 'right' = cursor ↙↗. */
  corner: 'left' | 'right'
  /** Deltas en px desde el inicio del drag (dx: +derecha, dy: +abajo). En vivo, 1 vez por frame. */
  onLive?: (dx: number, dy: number) => void
  /** Deltas totales al soltar (o por pulsación de teclado). */
  onCommit: (dx: number, dy: number) => void
}

const CORNER_KEYBOARD_STEP = 20

/**
 * Esquinera diagonal: redimensiona dos ejes a la vez (lateral + inferior).
 * Solo se monta donde el cruce existe (extremos del handle inferior cuando
 * el lateral correspondiente está abierto). Visual igual que el handle:
 * 3 puntos al hover/foco, mini-cápsula diagonal al presionar.
 */
export function CornerResizeHandle({
  label,
  corner,
  onLive,
  onCommit
}: CornerResizeHandleProps): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number } | null>(null)
  const liveRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      liveRef.current = null
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    },
    []
  )

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      event.preventDefault()
      event.currentTarget.focus()
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Puntero ya liberado: se ignora.
      }
      dragRef.current = { startX: event.clientX, startY: event.clientY }
      liveRef.current = { dx: 0, dy: 0, moved: false }
      setDragging(true)
      document.body.style.cursor = corner === 'left' ? 'nwse-resize' : 'nesw-resize'
      document.body.style.userSelect = 'none'
    },
    [corner]
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      const drag = dragRef.current
      const live = liveRef.current
      if (!drag || !live) return
      live.dx = event.clientX - drag.startX
      live.dy = event.clientY - drag.startY
      live.moved = true
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const g = liveRef.current
        if (!g) return
        onLive?.(g.dx, g.dy)
      })
    },
    [onLive]
  )

  const finishDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      const live = liveRef.current
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (live?.moved) onCommit(live.dx, live.dy)
      liveRef.current = null
      dragRef.current = null
      setDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      event.currentTarget.blur()
    },
    [onCommit]
  )

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = CORNER_KEYBOARD_STEP
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onCommit(-step, 0)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onCommit(step, 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      onCommit(0, -step)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      onCommit(0, step)
    }
  }

  return (
    <div
      role="separator"
      aria-label={label}
      tabIndex={0}
      data-dragging={dragging || undefined}
      data-corner={corner}
      className={styles.corner}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.dots} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className={styles.capsule} aria-hidden="true" />
    </div>
  )
}
