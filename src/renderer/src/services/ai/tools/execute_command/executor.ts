import type { ExecutionResult, ToolContext } from '../types'
import { resolvePath } from '../utils'

export async function execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    const command = args.command as string
    const cwd = args.path ? resolvePath(args.path as string, ctx.projectRoot) : ctx.projectRoot

    window.dispatchEvent(new CustomEvent('open-terminal-for-command', {
      detail: { command, cwd, commandId, status: 'start' }
    }))

    const response = await window.api.fs.execCommand(command, cwd, 60_000)

    window.dispatchEvent(new CustomEvent('terminal-command-done', {
      detail: { commandId }
    }))

    const output = response.stdout + (response.stderr ? `\n${response.stderr}` : '')
    if (response.exitCode !== 0) {
      return {
        success: false,
        content: JSON.stringify({
          type: 'terminal_output',
          command,
          output: output.trim().slice(0, 2000),
          exitCode: response.exitCode,
          completed: true,
          timedOut: response.timedOut,
        })
      }
    }

    // Truncate to 300 lines max
    let trimmedOutput = output.trim()
    const outputLines = trimmedOutput.split('\n')
    if (outputLines.length > 300) {
      trimmedOutput = outputLines.slice(-300).join('\n') + '\n\n[Output truncated to last 300 lines]'
    }

    return {
      success: true,
      content: JSON.stringify({
        type: 'terminal_output',
        command,
        output: trimmedOutput,
        exitCode: response.exitCode,
        completed: true,
        timedOut: response.timedOut,
      })
    }
  } catch (error) {
    return { success: false, content: `Error executing command: ${error}` }
  }
}
