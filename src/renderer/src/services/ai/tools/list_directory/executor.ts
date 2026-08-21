import type { ExecutionResult, ToolContext } from '../types'
import { resolvePath } from '../utils'

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', '.nuxt', '.output',
  '__pycache__', '.venv', 'venv', '.cache', '.turbo', 'coverage',
])

export async function execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const targetPath = args.path && args.path !== '.'
      ? resolvePath(args.path as string, ctx.projectRoot)
      : ctx.projectRoot

    const response = await window.api.fs.scanDirectory(targetPath, 1)

    if (!response.success) {
      return { success: false, content: `Error listing directory: ${response.error}` }
    }

    // Filter excluded directories
    const filtered = response.entries.filter(entry => {
      const segments = entry.path.replace(/\\/g, '/').split('/').filter(Boolean)
      return !segments.some(s => EXCLUDED_DIRS.has(s))
    })

    if (filtered.length === 0) {
      return {
        success: true,
        content: `Directory "${args.path || '.'}" is empty (no files or subdirectories).`
      }
    }

    const structure = filtered.map(entry => {
      const prefix = entry.is_directory ? '📁 ' : '📄 '
      return `${prefix}${entry.path}`
    }).join('\n')

    return { success: true, content: structure }
  } catch (error) {
    return { success: false, content: `Error listing directory: ${error}` }
  }
}
