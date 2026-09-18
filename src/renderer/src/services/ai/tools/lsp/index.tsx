import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { LspCard } from './visual'
import displayCss from './visual/LspCard.css?inline'

export const lspTool: Tool = {
  name: 'lsp',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'lsp',
    label: 'LSP',
    description: 'Language Server operations',
    category: 'code',
    dangerLevel: 'safe',
    enabledByDefault: true,
        icon: 'server',
    headerArgKey: ['operation', 'file_path'],
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <LspCard args={args} result={result} status={status} />,
  },
  execute
}
