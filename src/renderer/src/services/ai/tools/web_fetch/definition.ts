// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_fetch',
    description:
      'Fetch the content of a specific URL and return it as markdown.\n\n' +
      'Usage notes:\n' +
      '  - HTTP URLs are automatically upgraded to HTTPS\n' +
      '  - Private/link-local addresses are blocked (SSRF protection)\n' +
      '  - Long pages are truncated to fit the context window\n' +
      '  - It will NOT work for authenticated or private URLs (Google Docs, private repos, Jira, …)',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch content from.' }
      },
      required: ['url']
    }
  }
}
