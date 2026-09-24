// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'
export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'navigate_web',
    description: 'Interact with a browser tab (click, type, scroll).',
    parameters: {
      type: 'object',
      properties: {
        tab_id: { type: 'string', description: 'Tab ID (optional, uses most recent)' },
        action: { type: 'string', description: 'Action: click, type, scroll, select' },
        target: { type: 'string', description: 'Target element (text or selector)' },
        text: { type: 'string', description: 'Text to type (for type action)' },
        direction: { type: 'string', description: 'Scroll direction: up or down' }
      },
      required: ['action']
    }
  }
}
