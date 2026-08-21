import type { ExecutionResult, ToolContext } from '../types'

export async function execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const response = await window.api.fs.searchFiles(
      ctx.projectRoot,
      args.query as string,
      args.exclude_pattern as string | undefined,
      20
    )

    if (!response.success) {
      return { success: false, content: `Error searching files: ${response.error}` }
    }

    return {
      success: true,
      content: JSON.stringify(response.results, null, 2)
    }
  } catch (error) {
    return { success: false, content: `Error searching files: ${error}` }
  }
}
