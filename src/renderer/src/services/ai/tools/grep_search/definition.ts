import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'grep_search',
    description: 'Search for text within files in the project.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text to search for'
        },
        include_pattern: {
          type: 'string',
          description: 'File pattern to include (e.g. "*.ts")'
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Case sensitive search (default: false)'
        }
      },
      required: ['query']
    }
  }
}
