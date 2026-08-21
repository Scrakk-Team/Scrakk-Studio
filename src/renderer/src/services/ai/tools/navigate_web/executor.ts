import type { ExecutionResult, ToolContext } from '../types'
export async function execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  try {
    window.dispatchEvent(new CustomEvent('browser-action', { detail: args }))
    return { success: true, content: `Browser action "${args.action}" dispatched.` }
  } catch (error) {
    return { success: false, content: `Error navigating web: ${error}` }
  }
}
