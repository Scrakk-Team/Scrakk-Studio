import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { MultipleToolsCard } from './visual'
import displayCss from './visual/MultipleToolsCard.css?inline'

export const multipleToolsTool: Tool = {
  name: 'multiple_tools',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'multiple_tools',
    label: 'Multiple tools',
    description: 'Execute tools in sequence',
    category: 'utility',
    dangerLevel: 'medium',
    enabledByDefault: true,
        icon: 'grid',
    headerArgKey: 'calls',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <MultipleToolsCard args={args} result={result} status={status} />,
  },
  execute,
}
