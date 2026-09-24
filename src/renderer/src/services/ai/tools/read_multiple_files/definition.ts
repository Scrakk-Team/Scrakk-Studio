// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'
export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_multiple_files',
    description: 'Read multiple files at once.',
    parameters: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'List of file paths to read' }
      },
      required: ['paths']
    }
  }
}
