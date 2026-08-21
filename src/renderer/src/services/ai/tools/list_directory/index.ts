import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'

export const listDirectoryTool: Tool = {
  name: 'list_directory',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'list_directory',
    label: 'Listado',
    description: 'List directory contents',
    category: 'file',
    dangerLevel: 'safe',
    enabledByDefault: true,
    expandable: true,
  },
  execute,
}
