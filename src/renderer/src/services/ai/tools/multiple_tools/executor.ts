import type { ExecutionResult, ToolContext } from '../types'
export async function execute(_args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  return { success: true, content: 'multiple_tools is handled by the toolExecutor directly.' }
}
