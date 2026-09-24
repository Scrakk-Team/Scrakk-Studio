// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'append_file',
    description: 'Append content to the end of an existing file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to append to'
        },
        content: {
          type: 'string',
          description: 'Content to append'
        }
      },
      required: ['path', 'content']
    }
  }
}
