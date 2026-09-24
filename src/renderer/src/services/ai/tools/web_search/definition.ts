// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Search the web for up-to-date information, tailored for coding and software development tasks.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query to perform.' },
        allowed_domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of domains to restrict search to.'
        }
      },
      required: ['query']
    }
  }
}
