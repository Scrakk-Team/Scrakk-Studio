import type { ChatMessage } from '@services/chat'
import type { JSX } from 'react'
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
 * markdown (código, tablas, listas, links), con acciones de copiar y
 * regenerar debajo. Tool calls se muestran inline antes del contenido.
 */
export function MessageBubble({
  message,
  pending = false,
  onRegenerate
}: MessageBubbleProps): JSX.Element {
  const isUser = message.role === 'user'
  const rowClass = isUser ? styles.rowUser : styles.rowAssistant
  const bubbleClass = isUser ? styles.bubbleUser : styles.bubbleAssistant

  const hasToolCalls = !isUser && message.tool_calls && message.tool_calls.length > 0

  return (
    <div className={`${styles.row} ${rowClass}`}>
      <div className={`${styles.bubble} ${bubbleClass}`}>
        {/* Tool calls rendered inline */}
        {hasToolCalls ? (
          <ToolCallsBlock
            toolCalls={message.tool_calls!}
            toolResults={message.tool_results}
            status={pending ? 'running' : 'success'}
          />
        ) : null}

        {isUser ? message.content : <Markdown content={message.content} />}
        {!isUser && message.content && !pending ? (
          <MessageActions content={message.content} onRegenerate={onRegenerate} />
        ) : null}
      </div>
    </div>
  )
}
