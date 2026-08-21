import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'

export const deleteFileTool: Tool = {
  name: 'delete_file',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'delete_file',
    label: 'Borrando',
    description: 'Delete a file',
    category: 'file',
    dangerLevel: 'high',
    enabledByDefault: true,
    expandable: false,
  },
  execute,
}
