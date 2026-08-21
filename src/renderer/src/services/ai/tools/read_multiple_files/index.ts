import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
export const readMultipleFilesTool: Tool = {
  name: 'read_multiple_files',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'read_multiple_files',
    label: 'Leyendo archivos',
    description: 'Read multiple files',
    category: 'file',
    dangerLevel: 'safe',
    enabledByDefault: true,
    expandable: true,
  },
  execute,
}
