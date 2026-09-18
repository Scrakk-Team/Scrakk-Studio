import { ipcMain, type WebContents } from 'electron'
import { LLM_IPC, type LlmStreamRequest, type LlmToolCall } from '@shared/llm'
import { buildThinkingBody, type ThinkingMode } from '@shared/thinking'

interface OpenAiStreamToolCallDelta {
  index?: number
  id?: string
  function?: { name?: string | null; arguments?: string | null }
}

interface OpenAiStreamDelta {
  content?: string | null
  reasoning_content?: string | null
  reasoning?: string | null
  tool_calls?: OpenAiStreamToolCallDelta[]
}

interface OpenAiStreamChunk {
  choices?: Array<{ delta?: OpenAiStreamDelta }>
}

/**
 * Valida la forma del request. El renderer es la única fuente (app local),
 * pero un request malformado no debe tumbar el fetch.
 */
function isValidRequest(request: unknown): request is LlmStreamRequest {
  if (typeof request !== 'object' || request === null) return false
  const r = request as Record<string, unknown>
  return (
    typeof r.requestId === 'string' &&
    typeof r.providerId === 'string' &&
    typeof r.baseUrl === 'string' &&
    r.baseUrl.length > 0 &&
    typeof r.model === 'string' &&
    typeof r.apiKey === 'string' &&
    (r.thinkingMode === undefined || typeof r.thinkingMode === 'string') &&
    (r.tools === undefined || Array.isArray(r.tools)) &&
    Array.isArray(r.messages) &&
    r.messages.length > 0 &&
    r.messages.every((m) => {
      if (typeof m !== 'object' || m === null) return false
      const msg = m as Record<string, unknown>
      if (typeof msg.role !== 'string' || !['user', 'assistant', 'system', 'tool'].includes(msg.role)) {
        return false
      }
      // El content puede ser null solo en assistant con tool_calls (patrón
      // OpenAI: el mensaje que emitió las calls va sin texto).
      const content = msg.content
      if (content !== null && typeof content !== 'string') return false
      if (msg.role !== 'assistant' && typeof content !== 'string') return false
      // role 'tool' exige tool_call_id (responde a un tool_call previo).
      if (msg.role === 'tool' && typeof msg.tool_call_id !== 'string') return false
      return true
    })
  )
}

/** Envía un evento al renderer si el sender sigue vivo. */
function sendEvent(sender: WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

/** Streams activos por requestId — el botón "Detener" aborta el fetch. */
const activeStreams = new Map<string, AbortController>()

/**
 * Corre el fetch en stream (SSE) y emite los deltas por IPC.
 * `choices[0].delta.content` → contenido; `reasoning_content`/`reasoning` →
 * razonamiento (DeepSeek usa el primero, OpenRouter el segundo).
 */
async function runStream(sender: WebContents, request: LlmStreamRequest): Promise<void> {
  const { requestId, baseUrl, model, apiKey, headers, messages, thinkingMode, tools } = request
  const controller = new AbortController()
  activeStreams.set(requestId, controller)

  try {
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
    const extraBody = buildThinkingBody(model, (thinkingMode as ThinkingMode) ?? 'auto')

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        // Primero los del proveedor, después los críticos: el renderer
        // no puede pisar Content-Type ni Authorization.
        ...(headers ?? {}),
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        // Schemas de tools: el modelo puede invocarlas (function calling).
        ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
        ...extraBody
      }),
      // Un proveedor colgado no debe dejar el chat en isBusy para siempre;
      // el controller propio permite cortar desde el botón "Detener".
      signal: AbortSignal.any([AbortSignal.timeout(180_000), controller.signal])
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      const detail = body.slice(0, 300)
      sendEvent(sender, LLM_IPC.chatStreamError, {
        requestId,
        error: `El proveedor respondió ${response.status}${detail ? `: ${detail}` : ''}`
      })
      return
    }
    if (!response.body) {
      sendEvent(sender, LLM_IPC.chatStreamError, {
        requestId,
        error: 'El proveedor no devolvió un stream.'
      })
      return
    }

    // Parseo SSE: líneas "data: {json}" separadas por \n.
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''
    let fullReasoning = ''
    // Tool calls del stream, acumuladas por índice (los deltas traen los
    // argumentos partidos en chunks: primero id, después name/arguments).
    const streamedToolCalls: Array<LlmToolCall | undefined> = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let chunk: OpenAiStreamChunk
        try {
          chunk = JSON.parse(payload) as OpenAiStreamChunk
        } catch {
          continue
        }
        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue
        const reasoningDelta = delta.reasoning_content ?? delta.reasoning
        if (typeof reasoningDelta === 'string' && reasoningDelta) {
          fullReasoning += reasoningDelta
          sendEvent(sender, LLM_IPC.chatStreamReasoning, { requestId, delta: reasoningDelta })
        }
        if (typeof delta.content === 'string' && delta.content) {
          fullContent += delta.content
          sendEvent(sender, LLM_IPC.chatStreamChunk, { requestId, delta: delta.content })
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const index = tc.index ?? 0
            if (tc.id) {
              // Primer chunk de esta tool call: crea la entrada.
              streamedToolCalls[index] = {
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? ''
                }
              }
            } else if (streamedToolCalls[index]) {
              // Chunks siguientes: acumula name/arguments parciales.
              const current = streamedToolCalls[index]!
              if (tc.function?.name) current.function.name = tc.function.name
              if (tc.function?.arguments) current.function.arguments += tc.function.arguments
            }
          }
        }
      }
    }

    const completedToolCalls = streamedToolCalls.filter(
      (tc): tc is LlmToolCall => tc !== undefined
    )
    if (completedToolCalls.length > 0) {
      sendEvent(sender, LLM_IPC.chatStreamToolCalls, {
        requestId,
        toolCalls: completedToolCalls
      })
    }

    sendEvent(sender, LLM_IPC.chatStreamDone, {
      requestId,
      content: fullContent,
      reasoning: fullReasoning
    })
  } catch (error) {
    // Abort por "Detener": no es un error, se avisa y se conserva lo streamado.
    if (controller.signal.aborted) {
      sendEvent(sender, LLM_IPC.chatStreamStopped, { requestId })
      return
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      sendEvent(sender, LLM_IPC.chatStreamError, {
        requestId,
        error: 'El proveedor tardó demasiado en responder (3 min).'
      })
    } else {
      const message = error instanceof Error ? error.message : String(error)
      sendEvent(sender, LLM_IPC.chatStreamError, {
        requestId,
        error: `No se pudo conectar con el proveedor: ${message}`
      })
    }
  } finally {
    activeStreams.delete(requestId)
  }
}

export function registerLlmIpc(): void {
  ipcMain.handle(LLM_IPC.chatStreamStart, (event, request: unknown) => {
    if (!isValidRequest(request)) {
      return { ok: false, error: 'Request inválido' }
    }
    // Arranca el stream en background; los deltas llegan por eventos.
    void runStream(event.sender, request)
    return { ok: true }
  })

  // Botón "Detener": aborta el fetch del stream (fire-and-forget).
  ipcMain.on(LLM_IPC.chatStreamStop, (_event, payload: unknown) => {
    const requestId = (payload as { requestId?: string } | null)?.requestId
    if (typeof requestId !== 'string') return
    activeStreams.get(requestId)?.abort()
  })
}
