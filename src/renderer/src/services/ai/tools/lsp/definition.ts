import type { ToolDefinition } from '../types'

const OPERATIONS = [
  'goToDefinition',
  'goToImplementation',
  'findReferences',
  'hover',
  'goToTypeDefinition',
  'goToDeclaration',
  'documentHighlight',
  'documentSymbol',
  'workspaceSymbol',
  'completion',
  'codeAction',
  'rename',
  'signatureHelp',
  'documentFormatting',
  'documentRangeFormatting',
  'callHierarchyIncoming',
  'callHierarchyOutgoing',
  'prepareCallHierarchy',
  'diagnostics'
] as const

export const LSP_OPERATIONS = OPERATIONS

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'lsp',
    description:
      'Language Server Protocol operations: precise code navigation and analysis ' +
      '(go to definition/references, hover docs, symbols, rename with workspace edit, ' +
      'code actions, call hierarchy, diagnostics). Positions are 0-indexed.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: [...OPERATIONS],
          description: 'The LSP operation to perform.'
        },
        file_path: {
          type: 'string',
          description: 'Absolute path to the file.'
        },
        line: { type: 'number', description: '0-indexed line number.' },
        character: { type: 'number', description: '0-indexed column.' },
        query: { type: 'string', description: 'Symbol name or partial name (workspaceSymbol only).' },
        new_name: { type: 'string', description: 'New name for rename operations.' },
        end_line: { type: 'number', description: 'End line for range operations (0-indexed).' },
        end_character: { type: 'number', description: 'End column for range operations (0-indexed).' }
      },
      required: ['operation']
    }
  }
}
