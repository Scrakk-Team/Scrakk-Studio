import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
export const adjustTimeoutTool: Tool = {
  name: 'adjust_timeout',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'adjust_timeout',
    label: 'Timeout',
    description: 'Extend command timeout',
    category: 'utility',
    dangerLevel: 'low',
    enabledByDefault: true,
    expandable: false,
  },
  execute,
}
