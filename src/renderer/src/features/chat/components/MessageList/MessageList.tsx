import type { ChatMessage } from '@services/chat'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
  type PointerEvent
} from 'react'
import { MessageBubble } from '../MessageBubble/MessageBubble'
import { ThinkingState } from '../ThinkingState/ThinkingState'
import { ThoughtBlock } from '../ThoughtBlock/ThoughtBlock'
import styles from './MessageList.module.css'

interface MessageListProps {
  messages: ChatMessage[]
  /** true mientras un stream está en curso (el último mensaje se está armando). */
  isStreaming: boolean
  /** Regenera la última respuesta (el botón solo se muestra en el último mensaje). */
  onRegenerate?: () => void
  /** Clase extra sobre el root (p. ej. para acotar el ancho de la columna). */
  className?: string
}

/** Zona (px desde el borde derecho) que revela el scrollbar al pasar el cursor. */
const SCROLL_HOVER_ZONE = 16
/** Alto mínimo del pulgar del scrollbar custom. */
const THUMB_MIN_HEIGHT = 28

/**
 * Lista scrollable con scroll inteligente:
 * - Al montar (cambio de sesión) va al fondo, donde están los últimos mensajes.
 * - Al crecer, solo sigue al fondo si el usuario ya estaba cerca del fondo.
 *
 * Mientras el modelo piensa (stream sin contenido todavía) se muestra el
 * shimmer "Thinking"; el razonamiento va en el bloque "Thought for Ns".
 *
 * El scrollbar es custom (overlay): la barra nativa está oculta por CSS y se
 * dibuja un rail con pulgar que solo aparece al pasar el cursor por el lado
 * derecho de la lista. El pulgar se puede arrastrar (pointer capture).
 */
export function MessageList({
  messages,
  isStreaming,
  onRegenerate,
  className
}: MessageListProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)
  const dragRef = useRef<{ pointerId: number; startY: number; startTop: number } | null>(null)
  const [scrollVisible, setScrollVisible] = useState(false)

  // Mantiene la geometría del pulgar (alto y posición) según el scroll actual.
  const updateThumb = useCallback((): void => {
    const el = listRef.current
    const rail = railRef.current
    const thumb = thumbRef.current
    if (!el || !rail || !thumb) return

    const maxScroll = el.scrollHeight - el.clientHeight
    const canScroll = maxScroll > 0
    rail.style.display = canScroll ? 'block' : 'none'
    if (!canScroll) return

    const railHeight = rail.clientHeight
    const thumbHeight = Math.max(THUMB_MIN_HEIGHT, (el.clientHeight / el.scrollHeight) * railHeight)
    const thumbTop = (el.scrollTop / maxScroll) * (railHeight - thumbHeight)
    thumb.style.height = `${thumbHeight}px`
    thumb.style.transform = `translateY(${thumbTop}px)`
  }, [])

  // Scroll automático: al montar al fondo; al crecer, solo si está cerca.
  useEffect(() => {
    const el = listRef.current
    if (!el) return

    if (!mountedRef.current) {
      mountedRef.current = true
      el.scrollTop = el.scrollHeight
      return
    }

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 100) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Recalcular el pulgar cuando cambia el contenido o el tamaño del contenedor.
  useEffect(() => {
    updateThumb()
    const el = listRef.current
    if (!el) return
    const observer = new ResizeObserver(updateThumb)
    observer.observe(el)
    return () => observer.disconnect()
  }, [messages, updateThumb, scrollVisible])

  // El scrollbar solo aparece al pasar el cursor por el lado derecho de la
  // lista. Los handlers van en el wrapper (no en la lista): el pulgar es
  // hermano de la lista, y si el mouseleave estuviera en la lista, al mover
  // el cursor hacia el pulgar se dispararía mouseleave y se escondería el
  // rail justo antes de poder agarrarlo. setScrollVisible con comparación:
  // si el valor no cambia, React no re-renderiza (no hay re-render por cada
  // mousemove).
  const handleMouseMove = (event: MouseEvent<HTMLDivElement>): void => {
    const el = wrapRef.current
    if (!el) return
    const nearRightEdge = el.getBoundingClientRect().right - event.clientX < SCROLL_HOVER_ZONE
    setScrollVisible((current) => (current === nearRightEdge ? current : nearRightEdge))
  }

  const handleMouseLeave = (): void => {
    // Mientras se arrastra el pulgar (pointer capture), no ocultar el rail.
    if (dragRef.current) return
    setScrollVisible(false)
  }

  // Arrastrar el pulgar: pointer capture para que siga aunque el cursor se
  // vaya de la lista (misma técnica que el redimensionado de la sidebar).
  const handleThumbPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const el = listRef.current
    if (!el) return
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTop: el.scrollTop
    }
    setScrollVisible(true)
  }

  const handleThumbPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    const el = listRef.current
    const rail = railRef.current
    const thumb = thumbRef.current
    if (!drag || drag.pointerId !== event.pointerId || !el || !rail || !thumb) return

    const maxScroll = el.scrollHeight - el.clientHeight
    const maxThumbTravel = rail.clientHeight - thumb.offsetHeight
    if (maxScroll <= 0 || maxThumbTravel <= 0) return

    const delta = event.clientY - drag.startY
    el.scrollTop = drag.startTop + (delta / maxThumbTravel) * maxScroll
  }

  const handleThumbPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    dragRef.current = null
    // Si el cursor quedó fuera de la zona del scroll al soltar, ocultar.
    const el = wrapRef.current
    if (!el) return
    const nearRightEdge = el.getBoundingClientRect().right - event.clientX < SCROLL_HOVER_ZONE
    setScrollVisible(nearRightEdge)
  }

  return (
    <div
      ref={wrapRef}
      className={className ? `${styles.scrollWrap} ${className}` : styles.scrollWrap}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div ref={listRef} className={styles.list} role="log" aria-live="polite" onScroll={updateThumb}>
        {messages.map((message, index) => {
          const isLast = index === messages.length - 1
          const isPending = isLast && message.role === 'assistant' && isStreaming
          const hasReasoning = Boolean(message.role === 'assistant' && message.reasoning)
          return (
            <div key={message.id} className={styles.messageWrap}>
              {hasReasoning ? (
                // thinking = está razonando todavía (sin contenido): el header
                // del bloque muestra "Thinking"; al empezar el contenido pasa
                // a "Thought for Ns" con el tiempo que pensó.
                <ThoughtBlock
                  reasoning={message.reasoning ?? ''}
                  thinking={isPending && !message.content}
                />
              ) : null}
              {isPending && !message.content ? (
                // Sin razonamiento visible: el indicador Thinking va solo.
                hasReasoning ? null : <ThinkingState />
              ) : (
                <MessageBubble
                  message={message}
                  // Mientras el stream arma el mensaje: sin acciones, y sin
                  // Regenerar hasta que sea la última respuesta ya terminada.
                  pending={isPending}
                  onRegenerate={
                    message.role === 'assistant' && isLast && !isPending
                      ? onRegenerate
                      : undefined
                  }
                />
              )}
            </div>
          )
        })}
      </div>
      <div
        ref={railRef}
        className={`${styles.rail}${scrollVisible ? ` ${styles.railVisible}` : ''}`}
        aria-hidden="true"
      >
        <div
          ref={thumbRef}
          className={styles.thumb}
          onPointerDown={handleThumbPointerDown}
          onPointerMove={handleThumbPointerMove}
          onPointerUp={handleThumbPointerUp}
          onPointerCancel={handleThumbPointerUp}
        />
      </div>
    </div>
  )
}
