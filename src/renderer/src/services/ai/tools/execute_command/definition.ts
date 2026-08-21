import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'execute_command',
    description: 'Execute a shell command and return its output.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute'
        },
        path: {
          type: 'string',
          description: 'Working directory (optional, defaults to project root)'
        }
      },
      required: ['command']
    }
  }
}
