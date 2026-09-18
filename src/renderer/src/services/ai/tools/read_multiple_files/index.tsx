import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { ReadMultipleFilesCard } from './visual'
import displayCss from './visual/ReadMultipleFilesCard.css?inline'

export const readMultipleFilesTool: Tool = {
  name: 'read_multiple_files',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'read_multiple_files',
    label: 'Read multiple',
    description: 'Read multiple files at once',
    category: 'file',
    dangerLevel: 'safe',
    enabledByDefault: true,
        icon: 'file-multiple',
    headerArgKey: 'paths',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <ReadMultipleFilesCard args={args} result={result} status={status} />,
  },
  execute,
}
