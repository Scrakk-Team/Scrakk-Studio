import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { ListDirectoryCard } from './visual'
import displayCss from './visual/ListDirectoryCard.css?inline'

export const listDirectoryTool: Tool = {
  name: 'list_directory',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'list_directory',
    label: 'List',
    description: 'List directory contents',
    type: 'file',
    dangerLevel: 'safe',
    enabledByDefault: true,
        icon: 'folder',
    headerArgKey: 'path',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <ListDirectoryCard args={args} result={result} status={status} />,
  },
  execute,
}
