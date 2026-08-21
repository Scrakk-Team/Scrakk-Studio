import type { ToolDefinition } from '../types'
export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'history_title',
    description: 'Set the title of the current chat conversation.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title for the conversation' }
      },
      required: ['title']
    }
  }
}
