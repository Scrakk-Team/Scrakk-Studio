// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'
export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_browser_tabs',
    description: 'List all open browser tabs.',
    parameters: { type: 'object', properties: {}, required: [] }
  }
}
