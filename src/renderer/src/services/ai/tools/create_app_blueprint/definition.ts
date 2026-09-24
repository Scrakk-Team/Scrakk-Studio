// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'
export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_app_blueprint',
    description: 'Create an app blueprint/plan with features, stack, and layout.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'App name' },
        features: { type: 'array', items: { type: 'string' }, description: 'List of features' },
        layout: { type: 'string', description: 'Layout description' },
        stack: { type: 'object', properties: { languages: { type: 'array', items: { type: 'string' } }, technologies: { type: 'array', items: { type: 'string' } } }, description: 'Tech stack' }
      },
      required: ['name', 'features', 'layout', 'stack']
    }
  }
}
