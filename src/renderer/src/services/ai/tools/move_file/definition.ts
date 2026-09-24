// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'move_file',
    description: 'Move or rename a file.',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Current path of the file'
        },
        destination: {
          type: 'string',
          description: 'New path for the file'
        }
      },
      required: ['source', 'destination']
    }
  }
}
