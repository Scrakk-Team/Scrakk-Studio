import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { NavigateWebCard } from './visual'
import displayCss from './visual/NavigateWebCard.css?inline'

export const navigateWebTool: Tool = {
  name: 'navigate_web',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'navigate_web',
    label: 'Navigate',
    description: 'Interact with a browser tab',
    type: 'browser',
    dangerLevel: 'low',
    enabledByDefault: true,
        icon: 'compass',
    headerArgKey: ['action', 'target'],
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <NavigateWebCard args={args} result={result} status={status} />,
  },
  execute,
}
