import type { ExecutionResult, ToolContext } from '../types'
export async function execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const paths = args.paths as string[]
    const results: Record<string, string[]> = {}
    for (const p of paths) { results[p] = [] }
    return { success: true, content: Object.keys(results).length > 0 ? JSON.stringify(results, null, 2) : 'No diagnostics found.' }
  } catch (error) {
    return { success: false, content: `Error getting diagnostics: ${error}` }
  }
}
