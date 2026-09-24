// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { ReadFileCard } from './visual'
import displayCss from './visual/ReadFileCard.css?inline'

export const readFileTool: Tool = {
  name: 'read_file',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'read_file',
    label: 'Read',
    description: 'Read file contents',
    type: 'file',
    dangerLevel: 'safe',
    enabledByDefault: true,
        icon: 'file-text',
    headerArgKey: 'path',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <ReadFileCard args={args} result={result} status={status} />,
  },
  execute,
}
