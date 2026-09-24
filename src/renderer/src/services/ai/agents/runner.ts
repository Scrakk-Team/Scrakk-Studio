// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Runner de agentes — ejecución AISLADA de un subagente.
 *
 * Corre un mini-loop de tools sobre `window.api.llm.chatStream` usando el
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
  onToolResult?: (toolCallId: string, result: { content: string; success: boolean; blocked?: boolean }) => void
  sessionId?: string | null
}

export interface RunAgentResult {
  ok: boolean
  content: string
  error?: string
}

interface ResolvedProvider {
  provider: ProviderConfig
  apiKey: string
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
  const apiKey = state.apiKeys[providerId] ?? ''
  const chosen =
    agent.model && agent.model !== AGENT_MODEL_INHERIT
      ? agent.model
      : model || provider.defaultModel
  return {
    provider,
    apiKey,
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
      window.api.llm.stopStream(requestId)
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    stop = window.api.llm.chatStream(
      {
        requestId,
        providerId: resolved.provider.id,
        baseUrl: resolved.provider.baseUrl,
        model: resolved.model,
        apiKey: resolved.apiKey.trim(),
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
          toolCalls = calls
          onToolCalls?.(calls)
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
  if (!resolved.apiKey.trim()) {
    return { ok: false, content: '', error: `Falta la API key de ${resolved.provider.name}.` }
  }

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
      input.onToolCalls?.(toolCalls as ToolCall[])
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
          blocked: execution.blocked
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
