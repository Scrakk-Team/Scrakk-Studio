import type { LlmChatMessage, LlmToolCall } from '@shared/llm'
import type { ThinkingMode } from '@shared/thinking'
import type { ProviderConfig } from '../providers/types'
import type { ChatMessage, ChatReply, ToolCallInfo, ToolResultInfo } from './types'
import { buildSystemMessages } from '../ai/chatContextBuilder'
import { getEnabledToolDefinitions } from '../ai/tools'
import { executeTools } from '../ai/toolExecutor'

/** Entrada de un envío: el proveedor se resuelve en la UI (ProvidersProvider). */
export interface SendMessageInput {
  provider: ProviderConfig | null
  apiKey: string
  /** Id del modelo elegido por el usuario (fallback: defaultModel del config). */
  model: string
  /** Modo de pensamiento elegido para el modelo activo. */
  thinkingMode: ThinkingMode
  /** Variante de razonamiento elegida (`/variants`); manda sobre el modo. */
  variant?: string
  content: string
  /** Historial de la sesión — el modelo recibe el contexto completo. */
  history: ChatMessage[]
  /** Id de la sesión (para el scope de ejecución de tools). */
  sessionId?: string
  /** Deltas de contenido — el UI los va acumulando en la burbuja. */
  onContent?: (delta: string) => void
  /** Deltas de razonamiento — el UI los muestra en el bloque "Thought". */
  onReasoning?: (delta: string) => void
  /** Tool calls que el modelo emitió y están por ejecutarse. */
  onToolCalls?: (toolCalls: ToolCallInfo[]) => void
  /** Resultado de una tool call ejecutada. */
  onToolResult?: (toolCallId: string, result: ToolResultInfo) => void
  /**
   * Inicia una nueva ronda del ciclo agéntico (0 = primera respuesta).
   * El UI crea un SEGMENTO de burbuja por ronda: así reasoning/tools/
   * contenido de rondas consecutivas quedan como historial separado.
   */
  onRoundStart?: (round: number) => void
  /**
   * Señal de aborto del UI (botón "Detener"): corta el fetch en main y
   * resuelve con el contenido parcial, sin terminar en error.
   */
  signal?: AbortSignal
}

/**
 * Contrato del servicio de chat.
 * El feature `chat` depende SOLO de esta interfaz.
 */
export interface ChatService {
  sendMessage: (input: SendMessageInput) => Promise<ChatReply>
}

/** Tope de rondas de tool calls por turno (evita loops infinitos). */
const MAX_TOOL_ROUNDS = 12

function toToolCallInfo(toolCall: LlmToolCall): ToolCallInfo {
  return { ...toolCall }
}

/**
 * Servicio real con STREAM + ciclo agente: el fetch corre en el proceso main
 * vía IPC y los deltas llegan por eventos. Cuando el modelo emite tool calls
 * (delta.tool_calls), se ejecutan con el sistema de tools y los resultados
 * se re-alimentan al stream — el loop continúa hasta que el modelo responde
 * sin tools (patrón del chat de Scrakk Code Editor).
 */
export function createLlmChatService(): ChatService {
  return {
    sendMessage: (input): Promise<ChatReply> => {
      const { provider, apiKey, model, thinkingMode, variant, content, history } = input

      return new Promise((resolve, reject) => {
        if (!provider) {
          reject(new Error('No hay proveedor activo. Abre el menú de Proveedores y configura uno.'))
          return
        }
        if (!apiKey.trim()) {
          reject(new Error(`Falta la API key de ${provider.name}. La agregas en el menú de Proveedores.`))
          return
        }

        // El array de mensajes crece con cada ronda de tools: system +
        // historial + user + assistant(tool_calls) + tool results + …
        const messages: LlmChatMessage[] = [
          ...buildSystemMessages(input.sessionId ?? null),
          ...history.map((message) => ({ role: message.role, content: message.content })),
          { role: 'user', content }
        ]

        let fullContent = ''
        // requestId de la ronda en curso — el aborto del UI lo usa para
        // pedirle al proceso main que corte el fetch del stream.
        let activeRequestId: string | null = null

        // Botón "Detener": le avisa a main que aborte el fetch. La ronda
        // termina por el evento chatStreamStopped (onStopped) y el loop
        // corta al ver signal.aborted — se conserva todo lo streamado.
        const onAbort = (): void => {
          if (activeRequestId) window.api.llm.stopStream(activeRequestId)
        }
        input.signal?.addEventListener('abort', onAbort, { once: true })

        const streamRound = (): Promise<{ content: string; toolCalls: LlmToolCall[] }> => {
          return new Promise((roundResolve, roundReject) => {
            let settled = false
            let roundContent = ''
            let toolCalls: LlmToolCall[] = []
            // El requestId se genera antes de arrancar: si el usuario aprieta
            // "Detener" mientras el stream corre, main aborta ESTE fetch.
            const requestId = crypto.randomUUID()
            activeRequestId = requestId

            const stop = window.api.llm.chatStream(
              {
                requestId,
                providerId: provider.id,
                baseUrl: provider.baseUrl,
                // El id exacto del modelo tal como lo espera el proveedor.
                model: model || provider.defaultModel,
                apiKey: apiKey.trim(),
                headers: provider.headers,
                messages,
                thinkingMode,
                variant,
                // Schemas de las tools registradas (function calling).
                tools: getEnabledToolDefinitions(input.sessionId ?? null)
              },
              {
                onContent: (delta) => {
                  roundContent += delta
                  input.onContent?.(delta)
                },
                onReasoning: (delta) => input.onReasoning?.(delta),
                onToolCalls: (calls) => {
                  toolCalls = calls
                  input.onToolCalls?.(calls.map(toToolCallInfo))
                },
                onDone: () => {
                  if (settled) return
                  settled = true
                  activeRequestId = null
                  stop()
                  roundResolve({ content: roundContent, toolCalls })
                },
                onStopped: () => {
                  if (settled) return
                  settled = true
                  activeRequestId = null
                  stop()
                  // Resolve (no reject): lo streamado hasta aquí es válido.
                  roundResolve({ content: roundContent, toolCalls })
                },
                onError: (error) => {
                  if (settled) return
                  settled = true
                  activeRequestId = null
                  stop()
                  roundReject(new Error(error))
                }
              }
            )
          })
        }

        void (async (): Promise<void> => {
          try {
            for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
              // Detenido por el usuario: corta el ciclo y devuelve lo acumulado.
              if (input.signal?.aborted) break

              input.onRoundStart?.(round)
              const { content: roundContent, toolCalls } = await streamRound()
              fullContent += roundContent

              // Sin tool calls → respuesta final.
              if (toolCalls.length === 0) {
                resolve({ content: fullContent })
                return
              }

              // Dedup por tool_call_id: si el provider repite ids, no volver
              // a ejecutar (evita doble write/delete).
              const seenIds = new Set<string>()
              const deduped: LlmToolCall[] = []
              for (const tc of toolCalls) {
                if (tc.id && seenIds.has(tc.id)) continue
                if (tc.id) seenIds.add(tc.id)
                deduped.push(tc)
              }

              // Marca la ronda del assistant con sus tool calls en el
              // historial que se re-alimenta al provider. content: null
              // (patrón scrakk/OpenAI) — algunos providers rechazan ''.
              messages.push({
                role: 'assistant',
                content: roundContent || null,
                tool_calls: deduped
              })

              // Ejecuta secuencialmente (patrón scrakk: for, no paralelo).
              // El signal del UI llega a las tools: las pendientes se marcan
              // "[Aborted by user]" en vez de correr.
              let executions: Array<{ result: { tool_call_id: string; content: string }; execution: { success: boolean; blocked?: boolean } }>
              try {
                const result = await executeTools(deduped, input.sessionId, input.signal)
                executions = result
              } catch (dispatchError) {
                executions = deduped.map((tc) => ({
                  result: {
                    tool_call_id: tc.id,
                    role: 'tool' as const,
                    content: `Internal dispatch error: ${dispatchError instanceof Error ? dispatchError.message : String(dispatchError)}`
                  },
                  execution: { success: false }
                }))
              }

              for (const { result: toolResult, execution } of executions) {
                messages.push({
                  role: 'tool',
                  tool_call_id: toolResult.tool_call_id,
                  content: toolResult.content
                })
                input.onToolResult?.(toolResult.tool_call_id, {
                  content: toolResult.content,
                  success: execution.success,
                  blocked: execution.blocked
                })
              }
            }

            // Se llegó al tope de rondas: devolver lo acumulado.
            resolve({ content: fullContent })
          } catch (error) {
            reject(error)
          } finally {
            input.signal?.removeEventListener('abort', onAbort)
          }
        })()
      })
    }
  }
}
