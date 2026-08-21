import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
export const getDiagnosticsTool: Tool = {
  name: 'get_diagnostics',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'get_diagnostics',
    label: 'Diagnósticos',
    description: 'Get code diagnostics',
    category: 'code',
    dangerLevel: 'safe',
    enabledByDefault: true,
    expandable: true,
  },
  execute,
}
