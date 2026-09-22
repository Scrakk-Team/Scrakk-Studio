import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { HistoryTitleCard } from './visual'
import displayCss from './visual/HistoryTitleCard.css?inline'

export const historyTitleTool: Tool = {
  name: 'history_title',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'history_title',
    label: 'Title',
    description: 'Set conversation title',
    type: 'utility',
    dangerLevel: 'safe',
    enabledByDefault: true,
        icon: 'history',
    headerArgKey: 'title',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <HistoryTitleCard args={args} result={result} status={status} />,
  },
  execute,
}
