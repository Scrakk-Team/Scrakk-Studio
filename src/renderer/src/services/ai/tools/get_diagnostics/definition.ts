import type { ToolDefinition } from '../types'
export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_diagnostics',
    description: 'Get diagnostics (errors, warnings) for code files.',
    parameters: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'File paths to check' }
      },
      required: ['paths']
    }
  }
}
