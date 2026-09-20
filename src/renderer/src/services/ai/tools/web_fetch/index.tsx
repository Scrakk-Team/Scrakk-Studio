import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { WebFetchCard } from './visual'
import displayCss from './visual/WebFetchCard.css?inline'

export const webFetchTool: Tool = {
  name: 'web_fetch',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'web_fetch',
    label: 'Web Fetch',
    description: 'Fetch a URL as markdown',
    category: 'browser',
    dangerLevel: 'safe',
    enabledByDefault: true,
    icon: 'globe',
    headerArgKey: 'url',
    expandable: false,
    displayCss,
    renderBody: (args, result, status) => <WebFetchCard args={args} result={result} status={status} />
  },
  execute
}
