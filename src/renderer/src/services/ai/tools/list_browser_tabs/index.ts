import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
export const listBrowserTabsTool: Tool = {
  name: 'list_browser_tabs',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'list_browser_tabs',
    label: 'Pestañas abiertas',
    description: 'List browser tabs',
    category: 'browser',
    dangerLevel: 'safe',
    enabledByDefault: true,
    expandable: true,
  },
  execute,
}
