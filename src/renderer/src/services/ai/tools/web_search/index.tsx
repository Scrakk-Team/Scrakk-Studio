import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { WebSearchCard } from './visual'
import displayCss from './visual/WebSearchCard.css?inline'

export const webSearchTool: Tool = {
  name: 'web_search',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'web_search',
    label: 'Web Search',
    description: 'Search the web',
    category: 'browser',
    dangerLevel: 'safe',
    enabledByDefault: true,
    icon: 'search',
    headerArgKey: 'query',
    expandable: false,
    displayCss,
    renderBody: (args, result, status) => <WebSearchCard args={args} result={result} status={status} />
  },
  execute
}
