import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'

export const grepSearchTool: Tool = {
  name: 'grep_search',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'grep_search',
    label: 'Buscar en archivos',
    description: 'Search text in files',
    category: 'code',
    dangerLevel: 'safe',
    enabledByDefault: true,
    expandable: true,
  },
  execute,
}
