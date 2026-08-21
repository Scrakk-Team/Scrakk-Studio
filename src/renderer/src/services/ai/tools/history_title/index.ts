import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
export const historyTitleTool: Tool = {
  name: 'history_title',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'history_title',
    label: 'Título',
    description: 'Set conversation title',
    category: 'utility',
    dangerLevel: 'safe',
    enabledByDefault: true,
    expandable: false,
  },
  execute,
}
