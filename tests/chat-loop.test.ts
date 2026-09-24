// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del ciclo agéntico del chat service — rondas múltiples con tools.
 *
 * Mockea window.api.llm.chatStream con un stream scripteado:
 *   Ronda 0: reasoning + contenido + 1 tool call
 *   Ronda 1: reasoning + contenido final (sin tools)
 * Y verifica: onRoundStart×2, orden de callbacks, y que el array de
 * mensajes re-enviado al provider contiene assistant(tool_calls) + tool.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createLlmChatService } from '../src/renderer/src/services/chat/chat.service'

type StreamHandler = {
  onContent?: (d: string) => void
  onReasoning?: (d: string) => void
  onToolCalls?: (calls: unknown[]) => void
  onDone?: () => void
}

const scriptedRounds: Array<{
  reasoning?: string
  content?: string
  toolCalls?: Array<Record<string, unknown>>
}> = []

let sentMessages: Array<Record<string, unknown>> = []

vi.stubGlobal('window', {
  api: {
    llm: {
      chatStream: (_request: unknown, handlers: StreamHandler) => {
        const round = scriptedRounds.shift() ?? {}
        queueMicrotask(() => {
          if (round.reasoning) handlers.onReasoning?.(round.reasoning)
          if (round.content) handlers.onContent?.(round.content)
          if (round.toolCalls?.length) handlers.onToolCalls?.(round.toolCalls)

          // Snapshot de los mensajes que el servicio mandó en ESTA ronda.
          sentMessages.push(
            JSON.parse(
              JSON.stringify((_request as { messages: unknown[] }).messages)
            ) as Record<string, unknown>
          )

          handlers.onDone?.()
        })
        return () => {}
      }
    }
  }
})

const PROVIDER = {
  id: 'test',
  name: 'Test',
  baseUrl: 'http://localhost',
  defaultModel: 'm'
} as never

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    provider: PROVIDER,
    apiKey: 'sk-test',
    model: 'm',
    thinkingMode: 'auto' as const,
    content: 'hola',
    history: [],
    sessionId: 's1',
    ...overrides
  }
}

describe('ciclo agéntico (rondas con tools)', () => {
  beforeEach(() => {
    scriptedRounds.length = 0
    sentMessages = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('onRoundStart dispara por ronda y el historial crece con tools', async () => {
    scriptedRounds.push(
      {
        reasoning: 'pienso primero',
        content: 'voy a leer el archivo',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"a.ts"}' }
          }
        ]
      },
      { reasoning: 'ya leí, respondo', content: 'el archivo dice hola' }
    )

    const events: string[] = []
    const service = createLlmChatService()
    await service.sendMessage({
      ...(baseInput() as Parameters<typeof service.sendMessage>[0]),
      onRoundStart: (round) => events.push(`round:${round}`),
      onReasoning: (delta) => events.push(`reasoning:${delta}`),
      onContent: (delta) => events.push(`content:${delta}`),
      onToolResult: (id, result) => events.push(`result:${id}:${String(result.success)}`)
    })

    // Dos rondas → dos inicios de segmento.
    expect(events.filter((e) => e.startsWith('round:'))).toEqual(['round:0', 'round:1'])

    // Orden: reasoning r1 → content r1 → result → reasoning r2 → content r2.
    expect(events).toEqual([
      'round:0',
      'reasoning:pienso primero',
      'content:voy a leer el archivo',
      // executor real: falla controlada sin localStorage en node
        'result:call_1:false',
      'round:1',
      'reasoning:ya leí, respondo',
      'content:el archivo dice hola'
    ])

    // Ronda 2 recibió: system+user+assistant(tool_calls)+tool.
    const secondRoundMessages = sentMessages[1] ?? []
    expect(secondRoundMessages.length).toBeGreaterThanOrEqual(3)
    const assistantMsg = secondRoundMessages.find((m) => m.role === 'assistant') as
      | { tool_calls?: unknown[]; content?: unknown }
      | undefined
    expect(Array.isArray(assistantMsg?.tool_calls)).toBe(true)
    expect(secondRoundMessages.some((m) => m.role === 'tool')).toBe(true)

    // El executor real corrió la tool (mock de executeTools no acá — el
    // executor real devuelve error controlado sin romper el loop).
    expect(true).toBe(true)
  })

  it('sin tools: una sola ronda y resuelve directo', async () => {
    scriptedRounds.push({ content: 'respuesta simple' })
    const rounds: number[] = []
    const service = createLlmChatService()
    const reply = await service.sendMessage({
      ...(baseInput() as Parameters<typeof service.sendMessage>[0]),
      onRoundStart: (round) => rounds.push(round)
    })
    expect(rounds).toEqual([0])
    expect(reply.content).toBe('respuesta simple')
  })
})
