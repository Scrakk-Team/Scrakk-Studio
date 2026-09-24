// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'replace_in_file',
    description: 'Replace an exact string in a file. Read the file first to get the correct text.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to project root'
        },
        old_str: {
          type: 'string',
          description: 'The exact text to find and replace (must be unique in the file)'
        },
        new_str: {
          type: 'string',
          description: 'The text to replace it with'
        }
      },
      required: ['path', 'old_str', 'new_str']
    }
  }
}
