import { createLlmChatService, type ChatMessage, type ChatService } from '@services/chat'
import type { ToolCallInfo, ToolResultInfo } from '@services/chat/types'
import { useCallback, useState, type JSX } from 'react'
import { useProviders } from '@features/providers'
import { useChats, ModeGlow, ModeLabel, ChatModeBar } from '@features/chat'
import { ChatInput } from '@features/chat/components/ChatInput/ChatInput'
import { MessageList } from '@features/chat/components/MessageList/MessageList'
import { TimeGreeting } from '@features/chat/components/TimeGreeting/TimeGreeting'
import styles from './ChatPanel.module.css'

/**
 * Panel de chat: usa las sesiones reales del ChatsProvider (el historial
 * refleja lo que pasa acá) y delega el "backend" al módulo services. El LLM
 * sale por IPC al proceso main (sin CORS) usando el proveedor activo de
 * ProvidersProvider.
 *
 * Sin mensajes → el input va centrado arriba. Con mensajes → input abajo
 * y la lista mantiene la posición del usuario (scroll inteligente).
 *
 * Vive dentro del sistema de layouts: lo monta el PanelHost con su propio
 * ErrorBoundary, así un error de este panel no tumba el resto de la app.
 */
export function ChatPanel(): JSX.Element {
  const [service] = useState<ChatService>(() => createLlmChatService())
  const {
    activeSession,
    createSession,
    appendMessage,
    updateMessage,
    removeMessagesAfter
  } = useChats()
  const { activeProvider, getApiKey, getModel, getThinkingMode } = useProviders()
  const [isBusy, setIsBusy] = useState(false)

  const messages = activeSession?.messages ?? []
  const sessionId = activeSession?.id

  // Encola un mensaje de respuesta vacío y lo va llenando en vivo con el
  // stream (razonamiento y contenido por separado). Lo comparten el envío
  // normal y el "Regenerar". Si el modelo emite tool calls, el servicio las
  // ejecuta y las cards aparecen inline en la burbuja (ToolCallsBlock).
  const streamReply = useCallback(
    async (targetId: string, content: string, history: ChatMessage[]): Promise<void> => {
      const replyId = crypto.randomUUID()
      // Estado de tool calls de esta respuesta (se puebla con los callbacks).
      const toolCalls: ToolCallInfo[] = []
      const toolResults: Record<string, ToolResultInfo> = {}
      appendMessage(targetId, {
        id: replyId,
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      })
      setIsBusy(true)

      const syncToolCalls = (): void => {
        updateMessage(targetId, replyId, (message) => ({
          ...message,
          tool_calls: [...toolCalls],
          tool_results: { ...toolResults }
        }))
      }

      try {
        await service.sendMessage({
          provider: activeProvider,
          apiKey: activeProvider ? getApiKey(activeProvider.id) : '',
          model: activeProvider ? getModel(activeProvider.id) : '',
          thinkingMode: activeProvider ? getThinkingMode(activeProvider.id) : 'auto',
          content,
          history,
          sessionId: targetId,
          onReasoning: (delta) =>
            updateMessage(targetId, replyId, (message) => ({
              ...message,
              reasoning: (message.reasoning ?? '') + delta
            })),
          onContent: (delta) =>
            updateMessage(targetId, replyId, (message) => ({
              ...message,
              content: message.content + delta
            })),
          onToolCalls: (calls) => {
            toolCalls.length = 0
            toolCalls.push(...calls)
            syncToolCalls()
          },
          onToolResult: (toolCallId, result) => {
            toolResults[toolCallId] = result
            syncToolCalls()
          }
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Ups, algo salió mal. Probá de nuevo.'
        updateMessage(targetId, replyId, (current) => ({
          ...current,
          // Si el stream ya acumuló contenido, se conserva y se anexa el error.
          content: current.content ? `${current.content}\n\n${message}` : message
        }))
      } finally {
        setIsBusy(false)
      }
    },
    [service, activeProvider, getApiKey, getModel, getThinkingMode, appendMessage, updateMessage]
  )

  const handleSend = useCallback(
    async (content: string): Promise<void> => {
      const trimmed = content.trim()
      if (!trimmed || isBusy) return

      // Si no hay sesión activa (o arrancamos de cero), se crea una.
      const targetId = sessionId ?? createSession()

      appendMessage(targetId, {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now()
      })

      await streamReply(targetId, trimmed, messages)
    },
    [isBusy, sessionId, createSession, appendMessage, streamReply, messages]
  )

  // Regenerar: borra la última respuesta de la IA y vuelve a enviar el último
  // mensaje del usuario, usando como contexto todo lo anterior a ese mensaje.
  const handleRegenerate = useCallback(async (): Promise<void> => {
    if (!sessionId || isBusy) return

    let lastUserIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex < 0) return

    const content = messages[lastUserIndex].content
    const history = messages.slice(0, lastUserIndex)

    removeMessagesAfter(sessionId, lastUserIndex + 1)
    await streamReply(sessionId, content, history)
  }, [sessionId, isBusy, messages, removeMessagesAfter, streamReply])

  if (messages.length === 0) {
    return (
      <main className={styles.screen}>
        <div className={styles.emptyLayout}>
          <TimeGreeting />
          <div className={styles.emptyInput}>
            <ChatModeBar />
            <div className={styles.inputGlow}>
              <ModeGlow />
              <ChatInput onSend={handleSend} disabled={isBusy} />
            </div>
            <ModeLabel />
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.screen}>
      <div className={styles.body}>
        {/* key por sesión: al cambiar de chat, la lista arranca abajo (lo último). */}
        <div className={styles.messages}>
          <MessageList
            key={sessionId}
            className={styles.messagesList}
            messages={messages}
            isStreaming={isBusy}
            onRegenerate={handleRegenerate}
          />
        </div>
      </div>
      <div className={styles.composer}>
        <ChatModeBar />
        <div className={styles.inputGlow}>
          <ModeGlow />
          <ChatInput onSend={handleSend} disabled={isBusy} />
        </div>
        <ModeLabel />
      </div>
    </main>
  )
}