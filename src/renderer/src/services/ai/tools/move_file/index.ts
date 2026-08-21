import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'

export const moveFileTool: Tool = {
  name: 'move_file',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'move_file',
    label: 'Moviendo',
    description: 'Move or rename a file',
    category: 'file',
    dangerLevel: 'medium',
    enabledByDefault: true,
    expandable: false,
  },
  execute,
}
