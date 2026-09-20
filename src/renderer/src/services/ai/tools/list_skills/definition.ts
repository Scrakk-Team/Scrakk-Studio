import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_skills',
    description:
      'List the available skills with their descriptions. Use it to discover which skills can help before loading one.',
    parameters: {
      type: 'object',
      properties: {}
    }
  }
}
