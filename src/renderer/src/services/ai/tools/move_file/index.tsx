import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { MoveFileCard } from './visual'
import displayCss from './visual/MoveFileCard.css?inline'

export const moveFileTool: Tool = {
  name: 'move_file',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'move_file',
    label: 'Move',
    description: 'Move or rename a file',
    type: 'file',
    dangerLevel: 'medium',
    enabledByDefault: true,
        icon: 'arrow-right',
    headerArgKey: ['source', 'destination'],
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <MoveFileCard args={args} result={result} status={status} />,
  },
  execute,
}
