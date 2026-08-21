import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'

export const openBrowserTool: Tool = {
  name: 'open_browser',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'open_browser',
    label: 'Abriendo navegador',
    description: 'Open a URL in the browser',
    category: 'browser',
    dangerLevel: 'low',
    enabledByDefault: true,
    expandable: false,
  },
  execute,
}
