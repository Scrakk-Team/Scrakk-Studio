import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { WriteFileCard } from './visual'
import displayCss from './visual/WriteFileCard.css?inline'

export const writeFileTool: Tool = {
  name: 'write_file',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'write_file',
    label: 'Write file',
    description: 'Create or overwrite a file',
    category: 'file',
    dangerLevel: 'medium',
    enabledByDefault: true,
        icon: 'pencil',
    headerArgKey: 'path',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <WriteFileCard args={args} result={result} status={status} />,
  },
  execute,
}
