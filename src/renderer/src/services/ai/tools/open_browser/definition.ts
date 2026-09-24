// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'open_browser',
    description: 'Open a URL in the default browser.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open' }
      },
      required: ['url']
    }
  }
}
