/**
 * Tool definition for read_file
 */

import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read the content of a file. Use this to see what is inside a file before editing it.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to project root (e.g., "src/App.tsx", "package.json")'
        },
        start_line: {
          type: 'integer',
          description: 'Starting line number (optional, 1-indexed)'
        },
        end_line: {
          type: 'integer',
          description: 'Ending line number (optional)'
        }
      },
      required: ['path']
    }
  }
}
