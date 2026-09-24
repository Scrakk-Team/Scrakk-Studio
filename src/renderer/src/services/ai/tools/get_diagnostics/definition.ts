// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'
export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_diagnostics',
    description: 'Get diagnostics (errors, warnings) for code files.',
    parameters: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'File paths to check' }
      },
      required: ['paths']
    }
  }
}
