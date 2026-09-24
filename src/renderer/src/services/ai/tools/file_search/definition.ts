// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'file_search',
    description: 'Search for files by name pattern in the project.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (partial file name match)'
        },
        exclude_pattern: {
          type: 'string',
          description: 'Comma-separated patterns to exclude'
        }
      },
      required: ['query']
    }
  }
}
