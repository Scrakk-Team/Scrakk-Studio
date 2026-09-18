import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { GrepSearchCard } from './visual'
import displayCss from './visual/GrepSearchCard.css?inline'

export const grepSearchTool: Tool = {
  name: 'grep_search',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'grep_search',
    label: 'Grep search',
    description: 'Search text within files',
    category: 'code',
    dangerLevel: 'safe',
    enabledByDefault: true,
        icon: 'clipboard-search',
    headerArgKey: 'query',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <GrepSearchCard args={args} result={result} status={status} />,
  },
  execute,
}
