import type { ExecutionResult, ToolContext } from '../types'
export async function execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const title = (args.title as string || '').trim()
    if (!title) return { success: false, content: 'No title provided' }
    window.dispatchEvent(new CustomEvent('set-chat-title', { detail: { title } }))
    return { success: true, content: `Chat title set to: "${title}"` }
  } catch (error) {
    return { success: false, content: `Error setting title: ${error}` }
  }
}
