/**
 * Módulo compartido (main + preload + renderer) — contrato IPC del LLM.
 *
 * El renderer conoce la config del proveedor (baseUrl, modelo, key) y el
 * proceso main ejecuta el fetch en STREAM (SSE). Los deltas llegan por
 * eventos correlacionados con `requestId`; el renderer arma el mensaje
 * incrementalmente y muestra el razonamiento mientras piensa.
 */

export const LLM_IPC = {
  chatStreamStart: 'llm:chat-stream-start',
  chatStreamChunk: 'llm:chat-stream-chunk',
  chatStreamReasoning: 'llm:chat-stream-reasoning',
  chatStreamToolCalls: 'llm:chat-stream-tool-calls',
  chatStreamDone: 'llm:chat-stream-done',
  chatStreamError: 'llm:chat-stream-error',
  /** Renderer → main: corta el stream del requestId (botón "Detener"). */
  chatStreamStop: 'llm:chat-stream-stop',
  /** Main → renderer: el stream fue cortado por el usuario (no es error). */
  chatStreamStopped: 'llm:chat-stream-stopped'
} as const

export type LlmMessageRole = 'user' | 'assistant' | 'system' | 'tool'

/** Tool call emitida por el modelo (OpenAI function-calling). */
export interface LlmToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface LlmChatMessage {
  role: LlmMessageRole
  /** null solo para assistant con tool_calls (patrón OpenAI/scrakk). */
  content: string | null
  /** role 'tool': id del tool_call que esta respuesta ejecuta. */
  tool_call_id?: string
  /** role 'assistant': tool calls emitidas (se re-alimentan al provider). */
  tool_calls?: LlmToolCall[]
}

/**
 * Request de chat completions en stream — endpoint OpenAI-compatible
 * (`{baseUrl}/chat/completions` con `stream: true`).
 */
export interface LlmStreamRequest {
  /** Correlaciona los eventos del stream (un id por request). */
  requestId: string
  providerId: string
  baseUrl: string
  model: string
  apiKey: string
  /** Headers extra opcionales del proveedor (ej. HTTP-Referer de OpenRouter). */
  headers?: Record<string, string>
  messages: LlmChatMessage[]
  /** Modo de pensamiento elegido (auto/off/low/medium/high/on). */
  thinkingMode?: string
  /** Variante de razonamiento elegida con `/variants` (manda sobre el modo). */
  variant?: string
  /**
   * Schemas de tools (OpenAI function-calling) para que el modelo las pueda
   * invocar. Se pasan tal cual al body del request.
   */
  tools?: unknown[]
}

/** Eventos: todos llevan requestId para filtrar en el preload. */
export interface LlmStreamDeltaEvent {
  requestId: string
  delta: string
}

export interface LlmStreamDoneEvent {
  requestId: string
  content: string
  reasoning: string
}

/** Tool calls completas de un stream (si el modelo las emitió). */
export interface LlmStreamToolCallsEvent {
  requestId: string
  toolCalls: LlmToolCall[]
}

export interface LlmStreamErrorEvent {
  requestId: string
  error: string
}

export interface LlmStreamErrorEvent {
  requestId: string
  error: string
}

/** El stream fue detenido por el usuario (abort del fetch en main). */
export interface LlmStreamStoppedEvent {
  requestId: string
}

export interface LlmStreamHandlers {
  /** Delta de contenido (lo que se muestra en la burbuja). */
  onContent?: (delta: string) => void
  /** Delta de razonamiento (lo que se muestra en el bloque "Thought"). */
  onReasoning?: (delta: string) => void
  /** Tool calls del stream — llegan antes de onDone si el modelo las emitió. */
  onToolCalls?: (toolCalls: LlmToolCall[]) => void
  onDone?: () => void
  onError?: (error: string) => void
  /** El usuario presionó "Detener": el stream se cortó sin error. */
  onStopped?: () => void
}

/** API de LLM expuesta por el preload en `window.api.llm`. */
export interface LlmApi {
  /**
   * Inicia un stream y devuelve una función para cancelar la suscripción.
   * Los handlers reciben los deltas a medida que llegan.
   */
  chatStream: (request: LlmStreamRequest, handlers: LlmStreamHandlers) => () => void
  /** Corta el fetch del stream en el proceso main (botón "Detener"). */
  stopStream: (requestId: string) => void
}
