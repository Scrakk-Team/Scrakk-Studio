// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { ipcMain, type WebContents } from 'electron'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { LLM_IPC, type LlmStreamRequest, type LlmToolCall } from '@shared/llm'
import { isBlockedIp } from '../web/ssrf'
import { getCatalog } from '../models-dev/catalog'
import { resolveProviderBaseUrl } from '../models-dev/resolve'
import { buildThinkingBody, type ThinkingMode } from '@shared/thinking'
import { accumulateToolCallDeltas, finalizedToolCalls } from '../llm/streamToolCalls'
import {
  apiKeyStatus,
  deleteApiKey,
  getApiKey,
  migrateApiKeys,
  setApiKey
} from '../llm/apiKeys'

import { t } from '@shared/i18n'
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
    (r.apiKey === undefined || typeof r.apiKey === 'string') &&
    (r.thinkingMode === undefined || typeof r.thinkingMode === 'string') &&
    (r.variant === undefined || typeof r.variant === 'string') &&
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

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || /^127\./.test(host)
}

/**
 * Contrato del `baseUrl` que manda el renderer (sale del catálogo models.dev).
 *
 * - HTTPS obligatorio salvo loopback (Ollama y servers locales).
 * - Nunca se manda `Authorization` a una IP privada/link-local/metadata.
 * - `redirect: 'error'` más abajo: un 302 a otro host no filtra la key.
 */
async function assertSafeProviderUrl(raw: string): Promise<void> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('baseUrl inválida')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('baseUrl debe ser http(s)')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (url.protocol === 'http:' && !isLoopbackHost(host)) {
    throw new Error('baseUrl debe usar HTTPS')
  }
  if (isIP(host)) {
    if (isBlockedIp(host) && !isLoopbackHost(host)) {
      throw new Error('baseUrl apunta a una dirección privada')
    }
    return
  }
  const addrs = await lookup(host, { all: true, verbatim: true }).catch(() => [])
  if (addrs.length === 0) throw new Error('baseUrl no resuelve')
  const blocked = addrs.find((entry) => isBlockedIp(entry.address) && !isLoopbackHost(entry.address))
  if (blocked) throw new Error('baseUrl apunta a una dirección privada')
}

/** Envía un evento al renderer si el sender sigue vivo. */
function sendEvent(sender: WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

/** Streams activos por requestId — el botón "Detener" aborta el fetch. */
const activeStreams = new Map<string, AbortController>()

/**
 * Si el proveedor deja de mandar bytes por este tiempo, se corta con error.
 * Es un timeout de INACTIVIDAD, no total: una generación larga (o un modelo
 * que piensa mucho) puede durar lo que necesite mientras siga enviando datos.
 */
const IDLE_TIMEOUT_MS = 120_000
/** Tope de texto acumulado por stream (un proveedor malicioso no llena la RAM). */
const MAX_STREAM_CHARS = 8 * 1024 * 1024

/**
 * Corre el fetch en stream (SSE) y emite los deltas por IPC.
 * `choices[0].delta.content` → contenido; `reasoning_content`/`reasoning` →
 * razonamiento (DeepSeek usa el primero, OpenRouter el segundo).
 */
async function runStream(sender: WebContents, request: LlmStreamRequest): Promise<void> {
  const { requestId, providerId, baseUrl, model, headers, messages, thinkingMode, tools, variant } = request
  // La key la resuelve el main; el renderer ya no la persiste ni la conoce.
  const apiKey = request.apiKey?.trim() || (await getApiKey(providerId))
  if (!apiKey) {
    sendEvent(sender, LLM_IPC.chatStreamError, {
      requestId,
      error: t('main.falta.la.api.key')
    })
    return
  }
  const controller = new AbortController()
  activeStreams.set(requestId, controller)
  let idleTimedOut = false
  let connectTimedOut = false

  try {
    // El renderer no decide el endpoint de un proveedor conocido: la key se
    // enviaría a `https://atacante.tld` con un `baseUrl` arbitrario. Se usa el
    // del catálogo del main; para ids desconocidos (proveedor custom) se
    // valida el que llega.
    const catalog = await getCatalog()
    const effectiveBaseUrl = resolveProviderBaseUrl(catalog?.providers, providerId, baseUrl)
    await assertSafeProviderUrl(effectiveBaseUrl)
    const url = `${effectiveBaseUrl.replace(/\/+$/, '')}/chat/completions`
    const extraBody = buildThinkingBody(model, (thinkingMode as ThinkingMode) ?? 'auto', variant)

    // Corte si el proveedor ni siquiera devuelve cabeceras (conexión colgada).
    const connectTimer = setTimeout(() => {
      connectTimedOut = true
      controller.abort()
    }, IDLE_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(url, {
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
        // Un redirect podría llevar la `Authorization` a otro host.
        redirect: 'error',
        // Solo el controller propio (botón "Detener"); el corte por silencio se
        // maneja por lectura, no con un timeout total.
        signal: controller.signal
      })
    } finally {
      clearTimeout(connectTimer)
    }

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
        error: t('main.el.proveedor.no.devolvio.un')
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
    // Última emisión incremental (throttle) para pintar la tool EN VIVO.
    let lastToolEmit = 0

    /**
     * Emite las tool calls acumuladas, DEDUPLICADAS por `id` (ver
     * `streamToolCalls.ts`): la card de cada tool se dibuja desde este evento,
     * así que un id repetido en varios índices generaba N cards idénticas.
     */
    const emitToolCalls = (): void => {
      const unique = finalizedToolCalls(streamedToolCalls)
      if (unique.length === 0) return
      sendEvent(sender, LLM_IPC.chatStreamToolCalls, {
        requestId,
        toolCalls: unique
      })
    }

    // Lectura con timeout de INACTIVIDAD: si no llega ningún byte en
    // IDLE_TIMEOUT_MS, se aborta. Cada byte recibido reinicia el reloj.
    const readWithIdleTimeout = async (): Promise<{ done: boolean; value?: Uint8Array }> => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        return await Promise.race([
          reader.read(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              idleTimedOut = true
              controller.abort()
              reject(new Error('idle-timeout'))
            }, IDLE_TIMEOUT_MS)
          })
        ])
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    while (true) {
      const { done, value } = await readWithIdleTimeout()
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
        if (fullContent.length + fullReasoning.length > MAX_STREAM_CHARS) {
          await reader.cancel().catch(() => undefined)
          sendEvent(sender, LLM_IPC.chatStreamError, {
            requestId,
            error: 'La respuesta del proveedor supera el límite permitido.'
          })
          return
        }
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
          // Identidad por `id`, no por `index` (ver streamToolCalls.ts).
          accumulateToolCallDeltas(streamedToolCalls, delta.tool_calls)
          // Emisión INCREMENTAL (throttle ~50ms): la tool card se pinta
          // mientras el modelo la emite, no recién al terminar el stream.
          const now = Date.now()
          if (now - lastToolEmit > 50) {
            lastToolEmit = now
            emitToolCalls()
          }
        }
      }
    }

    emitToolCalls()

    sendEvent(sender, LLM_IPC.chatStreamDone, {
      requestId,
      content: fullContent,
      reasoning: fullReasoning
    })
  } catch (error) {
    // Corte por inactividad: el proveedor dejó de enviar datos.
    if (idleTimedOut) {
      sendEvent(sender, LLM_IPC.chatStreamError, {
        requestId,
        error: t('main.el.proveedor.dejo.de.enviar')
      })
      return
    }
    // El proveedor no devolvió cabeceras a tiempo.
    if (connectTimedOut) {
      sendEvent(sender, LLM_IPC.chatStreamError, {
        requestId,
        error: t('main.el.proveedor.no.respondio.2')
      })
      return
    }
    // Abort por "Detener": no es un error, se avisa y se conserva lo streamado.
    if (controller.signal.aborted) {
      sendEvent(sender, LLM_IPC.chatStreamStopped, { requestId })
      return
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      sendEvent(sender, LLM_IPC.chatStreamError, {
        requestId,
        error: t('main.el.proveedor.tardo.demasiado.en')
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
      return { ok: false, error: t('main.request.invalido') }
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

  // API keys: el renderer solo manda el valor al guardarlo y recibe booleanos.
  ipcMain.handle(LLM_IPC.setApiKey, (_event, providerId: unknown, apiKey: unknown) =>
    typeof providerId === 'string' && typeof apiKey === 'string'
      ? setApiKey(providerId, apiKey)
      : false
  )
  ipcMain.handle(LLM_IPC.deleteApiKey, (_event, providerId: unknown) =>
    typeof providerId === 'string' ? deleteApiKey(providerId) : false
  )
  ipcMain.handle(LLM_IPC.apiKeyStatus, () => apiKeyStatus())
  ipcMain.handle(LLM_IPC.migrateApiKeys, (_event, keys: unknown) => migrateApiKeys(keys))
}
