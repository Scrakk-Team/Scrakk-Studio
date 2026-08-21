import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'

export const appendFileTool: Tool = {
  name: 'append_file',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'append_file',
    label: 'Append',
    description: 'Append content to a file',
    category: 'file',
    dangerLevel: 'medium',
    enabledByDefault: true,
    expandable: true,
  },
  execute,
}
