import type { ExecutionResult, ToolContext } from '../types'
export async function execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  const seconds = args.additional_seconds as number || 30
  return { success: true, content: `Timeout extended by ${seconds} seconds.` }
}
