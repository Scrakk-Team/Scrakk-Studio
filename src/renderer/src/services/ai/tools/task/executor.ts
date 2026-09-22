import type { ExecutionResult, ToolContext } from '../types'
import { agentRegistry, runHeadlessAgent } from '../../agents'

/**
 * Ejecuta un subagente en aislamiento y devuelve su texto final. No toca la
 * conversación: el resultado entra como contenido de la tool.
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

  const result = await runHeadlessAgent({
    agent,
    prompt,
    signal: ctx.signal,
    sessionId: ctx.sessionId
  })
  if (!result.ok && !result.content) {
    return { success: false, content: `Subagent "${name}" failed: ${result.error ?? 'error'}` }
  }
  return { success: result.ok, content: result.content || (result.error ?? '') }
}
