import type { ExecutionResult, ToolContext } from '../types'
import { agentRegistry, linkToolCall, startSubagentSession, subagentSessions } from '../../agents'

/**
 * Ejecuta un subagente como una SESIÓN observable (su chat queda registrado y
 * se puede abrir). Devuelve su texto final y el `runId` de la sesión.
 */
export async function execute(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ExecutionResult> {
  const name = String(args.subagent_type ?? '').trim()
  const prompt = String(args.prompt ?? '').trim()
  if (!name) return { success: false, content: 'Missing "subagent_type".' }
  if (!prompt) return { success: false, content: 'Missing "prompt".' }

  const agent = agentRegistry.getSubagent(name)
  if (!agent) {
    const available = agentRegistry
      .listSubagents()
      .map((entry) => entry.id)
      .join(', ')
    return {
      success: false,
      content: `Unknown subagent "${name}". Available: ${available || '(none)'}.`
    }
  }

  const sessionId = startSubagentSession(agent, prompt, {
    signal: ctx.signal,
    sessionId: ctx.sessionId
  })
  // Liga el tool call con la sesión para poder abrirla desde la card.
  linkToolCall(ctx.toolCallId, sessionId)
  const session = await subagentSessions.waitFor(sessionId)

  const lastAssistant = [...session.messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.content.trim().length > 0)
  const content = lastAssistant?.content.trim() ?? ''
  const failed = session.status === 'error'

  if (failed && !content) {
    return {
      success: false,
      content: `Subagent "${name}" failed: ${session.error ?? 'error'}`,
      runId: sessionId
    }
  }
  return {
    success: !failed,
    content: content || (session.error ?? ''),
    runId: sessionId
  }
}
