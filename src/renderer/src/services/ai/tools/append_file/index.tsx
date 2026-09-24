// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { AppendFileCard } from './visual'
import displayCss from './visual/AppendFileCard.css?inline'

export const appendFileTool: Tool = {
  name: 'append_file',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'append_file',
    label: 'Append',
    description: 'Append content to a file',
    type: 'file',
    dangerLevel: 'medium',
    enabledByDefault: true,
        icon: 'plus',
    headerArgKey: 'path',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <AppendFileCard args={args} result={result} status={status} />,
  },
  execute,
}
