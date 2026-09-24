// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ChatMessage } from '@services/chat'
import { memo, type JSX } from 'react'
import { Markdown } from '../Markdown/Markdown'
import { MessageActions } from '../MessageActions/MessageActions'
import { ToolCallsBlock } from '../ToolCallsBlock'
import styles from './MessageBubble.module.css'

interface MessageBubbleProps {
  message: ChatMessage
  /** true mientras el mensaje se está armando (stream): oculta las acciones. */
  pending?: boolean
  /** Si viene, la última respuesta de la IA muestra el botón "Regenerar". */
  onRegenerate?: () => void
}

/**
 * Mensaje de chat.
 * User → burbuja accent compacta a la derecha, texto plano.
 * Assistant → texto a la izquierda sin fondo ni borde, renderizado en
 * markdown (código, tablas, listas, links). Las tool calls van DESPUÉS del
 * texto (el orden real del stream: el modelo escribe y después llama la
 * tool) y las acciones de copiar/regenerar cierran el mensaje al final.
 *
 * memo: el store preserva la identidad de los mensajes intactos por token,
 * así en un chat largo solo re-renderiza la burbuja que está streameando
 * (antes: cada token re-parseaba y re-resaltaba TODO el historial).
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  pending = false,
  onRegenerate
}: MessageBubbleProps): JSX.Element {
  const isUser = message.role === 'user'
  const rowClass = isUser ? styles.rowUser : styles.rowAssistant
  const bubbleClass = isUser ? styles.bubbleUser : styles.bubbleAssistant

  const hasToolCalls = !isUser && message.tool_calls && message.tool_calls.length > 0
  // Sin acciones en mensajes con herramientas: la respuesta final (la que no
  // trae tool calls) es la única con texto propio para copiar.
  const canCopy = !isUser && !hasToolCalls && !pending && message.content.trim().length > 0

  return (
    <div className={`${styles.row} ${rowClass}`}>
      <div className={`${styles.bubble} ${bubbleClass}`}>
        {isUser ? (
          message.content
        ) : pending ? (
          // Mientras streamea NO se parsea markdown (react-markdown + Prism es
          // lo más caro): texto plano que respeta saltos. Al terminar la ronda
          // se pinta markdown una sola vez.
          <div className={styles.streamText}>{message.content}</div>
        ) : (
          <Markdown content={message.content} />
        )}

        {/* Tool calls DESPUÉS del texto: una tool que el modelo llama tras
            escribir aparece debajo de lo que escribió, no encima. */}
        {hasToolCalls ? (
          <ToolCallsBlock
            toolCalls={message.tool_calls!}
            toolResults={message.tool_results}
            status={pending ? 'running' : 'success'}
          />
        ) : null}

        {canCopy ? (
          <MessageActions content={message.content} onRegenerate={onRegenerate} />
        ) : null}
      </div>
    </div>
  )
})
