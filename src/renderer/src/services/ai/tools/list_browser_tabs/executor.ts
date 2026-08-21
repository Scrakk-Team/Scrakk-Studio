import type { ExecutionResult, ToolContext } from '../types'
export async function execute(_args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  window.dispatchEvent(new CustomEvent('list-browser-tabs'))
  return { success: true, content: 'Listing browser tabs. Check the browser panel.' }
}
