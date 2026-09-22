/**
 * Sesiones de subagente — el subagente es un CHAT individual más.
 *
 * Cada spawn crea una sesión con su propio transcript (`ChatMessage[]`) que se
 * llena en vivo (contenido, razonamiento, tool calls y resultados), igual que
 * el chat principal. La UI lo renderiza con los mismos componentes de chat.
 *
 * `isViewOpen()` lo lee el input del chat principal para bloquearse mientras
 * estás dentro de un subagente.
 */

import type { ChatMessage, ToolCallInfo, ToolResultInfo } from '@services/chat'
import { runHeadlessAgent } from './runner'
import type { AgentProfile } from './types'

export interface SubagentSession {
  id: string
  agentId: string
  agentLabel: string
  prompt: string
  status: 'running' | 'done' | 'error'
  messages: ChatMessage[]
  error?: string
  startedAt: number
}

export interface StartSessionOptions {
  sessionId?: string | null
  signal?: AbortSignal
}

type Listener = () => void

interface Delta {
  content: string
  reasoning: string
}

function scheduleFrame(cb: () => void): number | null {
  if (typeof requestAnimationFrame !== 'function') {
    cb()
    return null
  }
  return requestAnimationFrame(cb)
}

class SubagentSessionStore {
  private sessions = new Map<string, SubagentSession>()
  private listeners = new Set<Listener>()
  private pending = new Map<string, Delta>()
  private rafHandle: number | null = null
  private viewOpen = false

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  get(id: string): SubagentSession | undefined {
    return this.sessions.get(id)
  }

  list(): SubagentSession[] {
    return [...this.sessions.values()]
  }

  /** true mientras el modal del subagente está abierto (bloquea el input). */
  isViewOpen(): boolean {
    return this.viewOpen
  }

  setViewOpen(open: boolean): void {
    if (this.viewOpen === open) return
    this.viewOpen = open
    this.emit()
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // Un suscriptor roto no debe tumbar a los demás.
      }
    }
  }

  private patch(id: string, updater: (session: SubagentSession) => SubagentSession): void {
    const current = this.sessions.get(id)
    if (!current) return
    this.sessions.set(id, updater(current))
    this.emit()
  }

  private pushMessage(sessionId: string, message: ChatMessage): void {
    this.patch(sessionId, (session) => ({ ...session, messages: [...session.messages, message] }))
  }

  private patchMessage(
    sessionId: string,
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage
  ): void {
    this.patch(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((message) =>
        message.id === messageId ? updater(message) : message
      )
    }))
  }

  private buffer(sessionId: string, segmentId: string, patch: Partial<Delta>): void {
    const key = `${sessionId}|${segmentId}`
    const current = this.pending.get(key) ?? { content: '', reasoning: '' }
    this.pending.set(key, {
      content: current.content + (patch.content ?? ''),
      reasoning: current.reasoning + (patch.reasoning ?? '')
    })
    if (this.rafHandle !== null) return
    this.rafHandle = scheduleFrame(() => {
      this.rafHandle = null
      this.flushNow()
    })
  }

  private flushNow(): void {
    if (this.rafHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafHandle)
    }
    this.rafHandle = null
    if (this.pending.size === 0) return
    const entries = [...this.pending.entries()]
    this.pending.clear()
    for (const [key, delta] of entries) {
      const sep = key.indexOf('|')
      const sessionId = key.slice(0, sep)
      const segmentId = key.slice(sep + 1)
      this.patchMessage(sessionId, segmentId, (message) => ({
        ...message,
        content: message.content + delta.content,
        reasoning: delta.reasoning ? (message.reasoning ?? '') + delta.reasoning : message.reasoning
      }))
    }
  }

  /**
   * Crea la sesión y corre el subagente con streaming en vivo. Devuelve el id
   * de la sesión (para que la UI lo abra).
   */
  start(agent: AgentProfile, prompt: string, options: StartSessionOptions = {}): string {
    const id = crypto.randomUUID()
    const session: SubagentSession = {
      id,
      agentId: agent.id,
      agentLabel: agent.label,
      prompt,
      status: 'running',
      messages: [
        { id: crypto.randomUUID(), role: 'user', content: prompt, timestamp: Date.now() }
      ],
      startedAt: Date.now()
    }
    this.sessions.set(id, session)
    this.emit()

    let segmentId = ''
    void (async () => {
      try {
        const result = await runHeadlessAgent({
          agent,
          prompt,
          signal: options.signal,
          sessionId: options.sessionId,
          onRoundStart: () => {
            segmentId = crypto.randomUUID()
            this.pushMessage(id, {
              id: segmentId,
              role: 'assistant',
              content: '',
              timestamp: Date.now()
            })
          },
          onContent: (delta) => this.buffer(id, segmentId, { content: delta }),
          onReasoning: (delta) => this.buffer(id, segmentId, { reasoning: delta }),
          onToolCalls: (calls) =>
            this.patchMessage(id, segmentId, (message) => ({
              ...message,
              tool_calls: [...(calls as ToolCallInfo[])]
            })),
          onToolResult: (toolCallId, result) =>
            this.patchMessage(id, segmentId, (message) => ({
              ...message,
              tool_results: {
                ...(message.tool_results ?? {}),
                [toolCallId]: result as ToolResultInfo
              }
            }))
        })
        this.flushNow()
        this.patch(id, (current) => ({
          ...current,
          status: result.ok ? 'done' : 'error',
          error: result.error
        }))
      } catch (error) {
        this.flushNow()
        this.patch(id, (current) => ({
          ...current,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        }))
      }
    })()

    return id
  }
}

export const subagentSessions = new SubagentSessionStore()

export function startSubagentSession(
  agent: AgentProfile,
  prompt: string,
  options?: StartSessionOptions
): string {
  return subagentSessions.start(agent, prompt, options)
}
