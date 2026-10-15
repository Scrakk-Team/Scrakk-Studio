// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'grep_search',
    description:
      'Search for text within files in the project. The query is EXACT (literal) by default — set `regex: true` to use a regular expression.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The text to search for. Treated literally unless `regex` is true.'
        },
        regex: {
          type: 'boolean',
          description: 'Treat `query` as a regular expression (default: false = exact text).'
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
