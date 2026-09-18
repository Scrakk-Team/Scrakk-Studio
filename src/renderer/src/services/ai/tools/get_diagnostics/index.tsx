import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { DiagnosticsCard } from './visual'
import displayCss from './visual/DiagnosticsCard.css?inline'

export const getDiagnosticsTool: Tool = {
  name: 'get_diagnostics',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'get_diagnostics',
    label: 'Diagnostics',
    description: 'Get code diagnostics',
    category: 'code',
    dangerLevel: 'safe',
    enabledByDefault: true,
        icon: 'alert',
    headerArgKey: 'paths',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <DiagnosticsCard args={args} result={result} status={status} />,
  },
  execute,
}
