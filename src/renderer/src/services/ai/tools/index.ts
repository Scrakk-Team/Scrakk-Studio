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
import { createAppBlueprintTool } from './create_app_blueprint'
import { historyTitleTool } from './history_title'
import { adjustTimeoutTool } from './adjust_timeout'
import { multipleToolsTool } from './multiple_tools'
import { lspTool } from './lsp'
import { listSkillsTool } from './list_skills'
import { skillTool } from './skill'
import { webSearchTool } from './web_search'
import { webFetchTool } from './web_fetch'
import { toolSettingsService } from '../toolSettings'
import { policyEngine } from '../policy/policy-engine'
import { modeRegistry } from '../policy/modeRegistry'

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
  registry.register(createAppBlueprintTool, opts)
  registry.register(historyTitleTool, opts)
  registry.register(adjustTimeoutTool, opts)
  registry.register(multipleToolsTool, opts)
  registry.register(lspTool, opts)
  registry.register(listSkillsTool, opts)
  registry.register(skillTool, opts)
  registry.register(webSearchTool, opts)
  registry.register(webFetchTool, opts)
}

export function getToolDefinitions(keep?: Set<string>): import('./types').ToolDefinition[] {
  if (keep) return registry.getDefinitionsFiltered(keep)
  return registry.getDefinitions()
}

/**
 * Definiciones de las tools HABILITADAS (settings globales + override de
 * sesión + filtro del modo activo). Es lo que se anuncia al modelo en el
 * system prompt y en el request: una tool deshabilitada no debe existir para
 * la IA.
 */
export function getEnabledToolDefinitions(
  sessionId: string | null = null
): import('./types').ToolDefinition[] {
  const mode = modeRegistry.get(policyEngine.getModeId())
  const include = mode?.toolFilter?.include
  const exclude = new Set(mode?.toolFilter?.exclude ?? [])

  const enabled = new Set(
    registry.getNames().filter((name) => {
      if (!toolSettingsService.isEnabledForSession(sessionId, name)) return false
      if (exclude.has(name)) return false
      if (include && !include.includes(name)) return false
      return true
    })
  )
  return registry.getDefinitionsFiltered(enabled)
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
