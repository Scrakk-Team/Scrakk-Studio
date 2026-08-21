import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
export const viewWebTool: Tool = {
  name: 'view_web',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'view_web',
    label: 'Viendo web',
    description: 'Fetch web page content',
    category: 'browser',
    dangerLevel: 'low',
    enabledByDefault: true,
    expandable: true,
  },
  execute,
}
