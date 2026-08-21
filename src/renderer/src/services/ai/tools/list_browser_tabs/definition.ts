import type { ToolDefinition } from '../types'
export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_browser_tabs',
    description: 'List all open browser tabs.',
    parameters: { type: 'object', properties: {}, required: [] }
  }
}
