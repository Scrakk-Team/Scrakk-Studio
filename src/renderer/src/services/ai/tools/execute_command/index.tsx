import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { TerminalCard } from './visual'
import displayCss from './visual/TerminalCard.css?inline'

export const executeCommandTool: Tool = {
  name: 'execute_command',
  definition,
  permissions,
  prompt,
  mutationBehavior: 'shell',
  meta: {
    name: 'execute_command',
    label: 'Terminal',
    description: 'Execute a terminal command',
    category: 'system',
    dangerLevel: 'high',
    enabledByDefault: true,
    icon: 'terminal',
    headerArgKey: 'command',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <TerminalCard args={args} result={result} status={status} />,
  },
  execute,
}
