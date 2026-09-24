// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { TimeoutCard } from './visual'
import displayCss from './visual/TimeoutCard.css?inline'

export const adjustTimeoutTool: Tool = {
  name: 'adjust_timeout',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'adjust_timeout',
    label: 'Timeout',
    description: 'Extend command timeout',
    type: 'utility',
    dangerLevel: 'low',
    enabledByDefault: true,
        icon: 'timer',
    headerArgKey: 'additional_seconds',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <TimeoutCard args={args} result={result} status={status} />,
  },
  execute,
}
