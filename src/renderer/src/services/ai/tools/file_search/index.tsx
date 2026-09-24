// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { FileSearchCard } from './visual'
import displayCss from './visual/FileSearchCard.css?inline'

export const fileSearchTool: Tool = {
  name: 'file_search',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'file_search',
    label: 'File search',
    description: 'Search files by name',
    type: 'code',
    dangerLevel: 'safe',
    enabledByDefault: true,
        icon: 'search',
    headerArgKey: 'query',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <FileSearchCard args={args} result={result} status={status} />,
  },
  execute,
}
