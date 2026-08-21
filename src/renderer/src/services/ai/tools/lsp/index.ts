import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'

export const lspTool: Tool = {
  name: 'lsp',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'lsp',
    label: 'LSP',
    description: 'Language Server operations (definition, references, hover, symbols, rename, diagnostics)',
    category: 'code',
    dangerLevel: 'safe',
    enabledByDefault: true,
    expandable: true
  },
  execute
}
