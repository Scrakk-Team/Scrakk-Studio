/**
 * Tools barrel — registers all built-in tools.
 */

import { registry } from './registry'
import { readFileTool } from './read_file'
import { writeFileTool } from './write_file'
import { listDirectoryTool } from './list_directory'
import { executeCommandTool } from './execute_command'
import { readMultipleFilesTool } from './read_multiple_files'
import { appendFileTool } from './append_file'
import { replaceInFileTool } from './replace_in_file'
import { deleteFileTool } from './delete_file'
import { moveFileTool } from './move_file'
import { fileSearchTool } from './file_search'
import { grepSearchTool } from './grep_search'
import { getDiagnosticsTool } from './get_diagnostics'
import { openBrowserTool } from './open_browser'
import { viewWebTool } from './view_web'
import { listBrowserTabsTool } from './list_browser_tabs'
import { navigateWebTool } from './navigate_web'
import { createAppBlueprintTool } from './create_app_blueprint'
import { historyTitleTool } from './history_title'
import { adjustTimeoutTool } from './adjust_timeout'
import { multipleToolsTool } from './multiple_tools'
import { lspTool } from './lsp'

registerAll()

function registerAll(): void {
  const opts = { allowOverwrite: true }
  registry.register(readFileTool, opts)
  registry.register(writeFileTool, opts)
  registry.register(listDirectoryTool, opts)
  registry.register(executeCommandTool, opts)
  registry.register(readMultipleFilesTool, opts)
  registry.register(appendFileTool, opts)
  registry.register(replaceInFileTool, opts)
  registry.register(deleteFileTool, opts)
  registry.register(moveFileTool, opts)
  registry.register(fileSearchTool, opts)
  registry.register(grepSearchTool, opts)
  registry.register(getDiagnosticsTool, opts)
  registry.register(openBrowserTool, opts)
  registry.register(viewWebTool, opts)
  registry.register(listBrowserTabsTool, opts)
  registry.register(navigateWebTool, opts)
  registry.register(createAppBlueprintTool, opts)
  registry.register(historyTitleTool, opts)
  registry.register(adjustTimeoutTool, opts)
  registry.register(multipleToolsTool, opts)
  registry.register(lspTool, opts)
}

export function getToolDefinitions(keep?: Set<string>): import('./types').ToolDefinition[] {
  if (keep) return registry.getDefinitionsFiltered(keep)
  return registry.getDefinitions()
}

export { ToolRegistry, registry } from './registry'
export type {
  Tool,
  ToolCall,
  ToolResult,
  ExecutionResult,
  ToolContext,
  PermissionRule,
  PermissionType,
  ToolDefinition,
  ToolMeta,
  StateMachineResult,
} from './types'
export { ToolCallStatus } from './types'
export { setActiveToolSessionId, getActiveToolSessionId, getActiveToolDefinitions } from './session'
