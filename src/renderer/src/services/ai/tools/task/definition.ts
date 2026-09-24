// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'task',
    description:
      'Launch a subagent to work on a focused task in isolation and return its result. Use it to delegate exploration/research to a specialized agent.',
    parameters: {
      type: 'object',
      properties: {
        subagent_type: {
          type: 'string',
          description: 'Id of the subagent to launch (see the available subagents).'
        },
        prompt: {
          type: 'string',
          description: 'The task for the subagent. Be specific about what to find or do.'
        },
        description: {
          type: 'string',
          description: 'Short 3-5 word description of the task.'
        }
      },
      required: ['subagent_type', 'prompt']
    }
  }
}
