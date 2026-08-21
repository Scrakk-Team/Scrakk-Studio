import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
export const navigateWebTool: Tool = {
  name: 'navigate_web',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'navigate_web',
    label: 'Navegando',
    description: 'Interact with a browser tab',
    category: 'browser',
    dangerLevel: 'low',
    enabledByDefault: true,
    expandable: false,
  },
  execute,
}
