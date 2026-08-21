/**
 * read_file tool
 */

import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'

export const readFileTool: Tool = {
  name: 'read_file',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'read_file',
    label: 'Lectura',
    description: 'Read file contents',
    category: 'file',
    dangerLevel: 'safe',
    enabledByDefault: true,
    icon: 'read_file',
    headerArgKey: 'path',
    // Sin card ni despliegue: una sola línea "Leí {path}" sin fondo.
    expandable: false,
    plain: true,
    plainText: 'Leí'
  },
  execute,
}
