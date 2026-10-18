// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Runner de agentes — ejecución AISLADA de un subagente.
 *
 * Corre un mini-loop de tools sobre `api.llm.chatStream` usando el
 * prompt/permisos/tools/modelo del agente, SIN aparecer en el transcript del
 * chat (equivalente a `surface_completion: false` del CLI). Lo usan la tool
 * `task` y la mención `@agente` del input.
 */

import type { LlmChatMessage, LlmToolCall } from '@shared/llm'
import type { ProviderConfig } from '@services/providers'
import { getProvider } from '@services/providers'
import { activeProviderSelection, readProviderSettings } from '@features/providers/settings'
import type { ToolCall, ToolDefinition } from '../tools/types'
import { AGENT_MODEL_INHERIT, type AgentProfile } from './types'
import { api } from '@services/api'

export interface RunAgentInput {
  agent: AgentProfile
  prompt: string
  signal?: AbortSignal
  /** Deltas de contenido (para UI en vivo opcional). */
  onContent?: (delta: string) => void
  /** Deltas de razonamiento. */
  onReasoning?: (delta: string) => void
  /** Arranca una ronda nueva (respuesta/tool calls). */
  onRoundStart?: (round: number) => void
  /** Tool calls emitidas por el subagente. */
  onToolCalls?: (calls: ToolCall[]) => void
  /** Resultado de una tool call del subagente. */
  onToolResult?: (
    toolCallId: string,
    result: {
      content: string
      success: boolean
      blocked?: boolean
      filePath?: string
      /**
       * Par antes/después que devuelven los tools de edición. Es lo que le
       * permite a la card abrir el diff sin releer nada: sin reenviarlo, el
       * `onOpen` de la tool recibe `undefined` y el click no hace nada.
       */
      originalContent?: string
      modifiedContent?: string
    }
  ) => void
  sessionId?: string | null
}

export interface RunAgentResult {
  ok: boolean
  content: string
  error?: string
}

interface ResolvedProvider {
  provider: ProviderConfig
  model: string
  thinkingMode: string
  variant: string
}

/** Tope de rondas del mini-loop (seguridad; corta el usuario). */
const MAX_ROUNDS = 24

function resolveProvider(agent: AgentProfile): ResolvedProvider | { error: string } {
  const { providerId, model } = activeProviderSelection()
  if (!providerId) return { error: 'No hay proveedor activo. Configuralo en Proveedores.' }
  const provider = getProvider(providerId)
  if (!provider) return { error: `El proveedor "${providerId}" no está en el catálogo.` }
  const state = readProviderSettings()
  const chosen =
    agent.model && agent.model !== AGENT_MODEL_INHERIT
      ? agent.model
      : model || provider.defaultModel
  return {
    provider,
    model: chosen,
    thinkingMode: state.thinkingModes[providerId] ?? 'auto',
    variant: state.variants[providerId] ?? ''
  }
}

/** Definiciones de tools que el agente puede usar (su filtro + hard). */
async function agentToolDefinitions(agent: AgentProfile): Promise<ToolDefinition[]> {
  // Import dinámico: evita el ciclo tools ↔ agents ↔ runner en el init.
  const { getEnabledToolDefinitions } = await import('../tools')
  const all = getEnabledToolDefinitions(null)
  const include = agent.tools.include
  const exclude = new Set(agent.tools.exclude ?? [])
  const hardInclude = agent.hardPermissions?.include
  const hardExclude = new Set(agent.hardPermissions?.exclude ?? [])
  return all.filter((definition) => {
    const name = definition.function.name
    if (hardExclude.has(name)) return false
    if (hardInclude && !hardInclude.includes(name)) return false
    if (exclude.has(name)) return false
    if (include && !include.includes(name)) return false
    return true
  })
}

function streamOnce(input: {
  resolved: ResolvedProvider
  messages: LlmChatMessage[]
  tools: unknown[]
  signal?: AbortSignal
  onContent?: (delta: string) => void
  onReasoning?: (delta: string) => void
  /** Se llama EN VIVO con las tool calls parciales (mientras el modelo las emite). */
  onToolCalls?: (calls: LlmToolCall[]) => void
}): Promise<{ content: string; toolCalls: LlmToolCall[] }> {
  const { resolved, messages, tools, signal, onContent, onReasoning, onToolCalls } = input
  return new Promise((resolve, reject) => {
    let content = ''
    let toolCalls: LlmToolCall[] = []
    let settled = false
    let stop: (() => void) | null = null
    const requestId = crypto.randomUUID()

    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      stop?.()
      signal?.removeEventListener('abort', onAbort)
      fn()
    }
    const onAbort = (): void => {
      api.llm.stopStream(requestId)
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    stop = api.llm.chatStream(
      {
        requestId,
        providerId: resolved.provider.id,
        baseUrl: resolved.provider.baseUrl,
        model: resolved.model,
        apiKey: undefined,
        headers: resolved.provider.headers,
        messages,
        thinkingMode: resolved.thinkingMode,
        variant: resolved.variant,
        tools
      },
      {
        onContent: (delta) => {
          content += delta
          onContent?.(delta)
        },
        onReasoning: (delta) => {
          onReasoning?.(delta)
        },
        onToolCalls: (calls) => {
          // Dedup por id: un proveedor no-conformante repite la misma call en
          // varios índices. Se filtra acá para que ninguna capa (sesión del
          // subagente o card) dibuje dos filas para la misma tool call.
          const seen = new Set<string>()
          toolCalls = calls.filter((call) => {
            // Sin nombre no es una tool call válida (card fantasma).
            if (!call.function?.name) return false
            if (!call.id) return true
            if (seen.has(call.id)) return false
            seen.add(call.id)
            return true
          })
          onToolCalls?.(toolCalls)
        },
        onDone: () => finish(() => resolve({ content, toolCalls })),
        onStopped: () => finish(() => resolve({ content, toolCalls })),
        onError: (error) => finish(() => reject(new Error(error)))
      }
    )
  })
}

/**
 * Corre el agente de punta a punta y devuelve su texto final. Los tool calls
 * se ejecutan con el sistema real de tools (permisos incluidos).
 */
export async function runHeadlessAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const resolved = resolveProvider(input.agent)
  if ('error' in resolved) return { ok: false, content: '', error: resolved.error }
  const tools = (await agentToolDefinitions(input.agent)) as unknown[]
  const messages: LlmChatMessage[] = []
  const system = input.agent.prompt.trim()
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: input.prompt })

  const { executeTools } = await import('../toolExecutor')

  let full = ''
  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      if (input.signal?.aborted) break
      input.onRoundStart?.(round)
      const { content, toolCalls } = await streamOnce({
        resolved,
        messages,
        tools,
        signal: input.signal,
        onContent: input.onContent,
        onReasoning: input.onReasoning,
        onToolCalls: input.onToolCalls
      })
      full += content
      if (toolCalls.length === 0) break
      // `onToolCalls` YA se emitió en vivo desde streamOnce (y otra vez al
      // cerrar el stream): re-emitir acá era un duplicado latente.
      messages.push({ role: 'assistant', content: content || null, tool_calls: toolCalls })
      const executions = await executeTools(
        toolCalls as ToolCall[],
        input.sessionId ?? undefined,
        input.signal
      )
      for (const { result, execution } of executions) {
        messages.push({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          content: result.content
        })
        input.onToolResult?.(result.tool_call_id, {
          content: result.content,
          success: execution.success,
          blocked: execution.blocked,
          filePath: execution.filePath,
          // El par viejo/nuevo de los tools de edición. Se reenviaba sólo
          // content/success/blocked, así que la card recibía `undefined` y su
          // `onOpen` (el que abre el diff) cortaba sin hacer nada.
          originalContent: execution.originalContent,
          modifiedContent: execution.modifiedContent
        })
      }
    }
  } catch (error) {
    return {
      ok: false,
      content: full,
      error: error instanceof Error ? error.message : String(error)
    }
  }
  return { ok: true, content: full }
}
