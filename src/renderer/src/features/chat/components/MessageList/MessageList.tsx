// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ChatMessage } from '@services/chat'
import { memo, useEffect, useRef, type JSX } from 'react'
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

/**
 * Lista scrollable con scroll inteligente:
 * - Al montar (cambio de sesión) va al fondo, donde están los últimos mensajes.
 * - Al crecer, solo sigue al fondo si el usuario ya estaba cerca del fondo.
 *
 * Mientras el modelo piensa (stream sin contenido todavía) se muestra el
 * shimmer "Thinking"; el razonamiento va en el bloque "Thought for Ns".
 *
 * Usa el scrollbar global (réplica de Innerta): sin rail custom.
 */
export const MessageList = memo(function MessageList({
  messages,
  isStreaming,
  onRegenerate,
  className
}: MessageListProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)

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

  return (
    <div
      ref={listRef}
      className={className ? `${styles.list} ${className}` : styles.list}
      role="log"
      aria-live="polite"
    >
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
                  message.role === 'assistant' && isLast && !isPending ? onRegenerate : undefined
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
})
