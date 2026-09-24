// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'
export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'adjust_timeout',
    description: 'Extend the timeout for the current command execution.',
    parameters: {
      type: 'object',
      properties: {
        additional_seconds: { type: 'integer', description: 'Additional seconds to add' }
      },
      required: ['additional_seconds']
    }
  }
}
