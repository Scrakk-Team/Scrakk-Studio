import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { DeleteFileCard } from './visual'
import displayCss from './visual/DeleteFileCard.css?inline'

export const deleteFileTool: Tool = {
  name: 'delete_file',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'delete_file',
    label: 'Delete',
    description: 'Delete a file',
    category: 'file',
    dangerLevel: 'high',
    enabledByDefault: true,
        icon: 'trash',
    headerArgKey: 'path',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <DeleteFileCard args={args} result={result} status={status} />,
  },
  execute,
}
