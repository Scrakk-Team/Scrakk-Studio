import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { OpenBrowserCard } from './visual'
import displayCss from './visual/OpenBrowserCard.css?inline'

export const openBrowserTool: Tool = {
  name: 'open_browser',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'open_browser',
    label: 'Open browser',
    description: 'Open a URL in the browser',
    type: 'browser',
    dangerLevel: 'low',
    enabledByDefault: true,
        icon: 'globe',
    headerArgKey: 'url',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <OpenBrowserCard args={args} result={result} status={status} />,
  },
  execute,
}
