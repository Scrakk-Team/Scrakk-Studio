// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_file',
    description: 'Create or overwrite a file with new content. Use replace_in_file to edit existing files.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to project root'
        },
        content: {
          type: 'string',
          description: 'The full content to write to the file'
        }
      },
      required: ['path', 'content']
    }
  }
}
