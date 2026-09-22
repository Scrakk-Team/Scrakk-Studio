import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { BrowserTabsCard } from './visual'
import displayCss from './visual/BrowserTabsCard.css?inline'

export const listBrowserTabsTool: Tool = {
  name: 'list_browser_tabs',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'list_browser_tabs',
    label: 'Browser tabs',
    description: 'List browser tabs',
    type: 'browser',
    dangerLevel: 'safe',
    enabledByDefault: true,
        icon: 'layers',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <BrowserTabsCard args={args} result={result} status={status} />,
  },
  execute,
}
