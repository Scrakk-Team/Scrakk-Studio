import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
export const multipleToolsTool: Tool = {
  name: 'multiple_tools',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'multiple_tools',
    label: 'Múltiples herramientas',
    description: 'Execute tools in sequence',
    category: 'utility',
    dangerLevel: 'medium',
    enabledByDefault: true,
    expandable: true,
  },
  execute,
}
