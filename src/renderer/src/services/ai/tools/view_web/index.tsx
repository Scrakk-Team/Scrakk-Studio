import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { ViewWebCard } from './visual'
import displayCss from './visual/ViewWebCard.css?inline'

export const viewWebTool: Tool = {
  name: 'view_web',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'view_web',
    label: 'View web',
    description: 'Fetch web page content',
    type: 'browser',
    dangerLevel: 'low',
    enabledByDefault: true,
        icon: 'eye',
    headerArgKey: 'url',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <ViewWebCard args={args} result={result} status={status} />,
  },
  execute,
}
