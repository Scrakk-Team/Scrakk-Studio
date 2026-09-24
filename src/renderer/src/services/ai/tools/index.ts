// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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
import { taskTool } from './task'
// Carga el catálogo (familias/tipos built-in) al importar las tools.
import './catalog'
import { toolSettingsService } from '../toolSettings'
import { policyEngine } from '../policy/policy-engine'
import { modeRegistry } from '../policy/modeRegistry'
import { agentRegistry, subagentsForMode } from '../agents'

type ToolDefinition = import('./types').ToolDefinition

/**
 * La descripción de la tool `task` se arma DINÁMICAMENTE: lista los subagentes
 * disponibles y cuándo conviene usarlos, para que el modelo decida bien (igual
 * que opencode/CLI describen sus subagentes). Llega al system prompt y al
 * request vía `getEnabledToolDefinitions`.
 */
function describeTask(base: ToolDefinition): ToolDefinition {
  const subagents = agentRegistry.listSubagents()
  if (subagents.length === 0) return base
  const list = subagents
    .map((agent) => `- ${agent.id}: ${agent.description ?? agent.label}`)
    .join('\n')
  const description =
    `${base.function.description}\n\n` +
    'When to use:\n' +
    '- Parallelize independent searches/analyses (launch several, then collect).\n' +
    '- Isolate heavy reading: delegate many file reads and get only the synthesis.\n' +
    '- Read-only code discovery: finding files, symbols, callers, or how something works.\n' +
    'Do NOT use it for trivial single-file lookups or for answers already in your context.\n\n' +
    'The subagent does NOT see this conversation: its prompt is the whole briefing — ' +
    'state the goal and why, what you already know, and the exact output you need ' +
    '(say it if you want a short answer).\n\n' +
    'Available subagents:\n' +
    list
  return { ...base, function: { ...base.function, description } }
}

/** Inyecta la descripción dinámica en las tools que la necesitan. */
function withDynamicDescriptions(defs: ToolDefinition[]): ToolDefinition[] {
  return defs.map((def) => (def.function.name === 'task' ? describeTask(def) : def))
}

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
  registry.register(taskTool, opts)
}

export function getToolDefinitions(keep?: Set<string>): import('./types').ToolDefinition[] {
  if (keep) return withDynamicDescriptions(registry.getDefinitionsFiltered(keep))
  return withDynamicDescriptions(registry.getDefinitions())
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
  // La tool `task` (subagentes) solo existe si hay subagentes disponibles.
  if (subagentsForMode(policyEngine.getModeId()).length === 0) enabled.delete('task')
  return withDynamicDescriptions(registry.getDefinitionsFiltered(enabled))
}

export { ToolRegistry, registry } from './registry'
export {
  toolCatalog,
  toolTypeOf,
  DEFAULT_TOOL_TYPE,
  EXTENSION_TOOL_TYPE,
  SUBAGENT_TOOL_TYPE,
  ENVIRONMENT_FAMILY,
  AGENTIC_FAMILY,
  EXTENSIONS_FAMILY,
  type ToolFamily,
  type ToolType
} from './catalog'
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
