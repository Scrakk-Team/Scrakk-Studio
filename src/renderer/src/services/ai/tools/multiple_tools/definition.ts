// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'
export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'multiple_tools',
    description: 'Execute multiple tools in sequence. Use when you need to perform several operations at once.',
    parameters: {
      type: 'object',
      properties: {
        tools: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tool_name: { type: 'string' },
              arguments: { type: 'object' }
            },
            required: ['tool_name', 'arguments']
          },
          description: 'List of tool calls to execute in order'
        }
      },
      required: ['tools']
    }
  }
}
