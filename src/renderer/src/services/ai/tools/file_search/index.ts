import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'

export const fileSearchTool: Tool = {
  name: 'file_search',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'file_search',
    label: 'Buscar archivos',
    description: 'Search files by name',
    category: 'code',
    dangerLevel: 'safe',
    enabledByDefault: true,
    expandable: true,
  },
  execute,
}
