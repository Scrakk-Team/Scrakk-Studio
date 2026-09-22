/**
 * Agentes — API pública del sistema unificado (primarios + subagentes).
 */

export type {
  AgentEntry,
  AgentMode,
  AgentPermissions,
  AgentPermissionsOverride,
  AgentProfile,
  AgentToolFilter
} from './types'
export { AGENT_MODEL_INHERIT } from './types'

export {
  agentRegistry,
  enabledSubagentIds,
  enabledSubagents,
  subagentsForMode
} from './registry'

export {
  DEFAULT_PRIMARY_AGENT,
  DEFAULT_SUBAGENT,
  loadAgentSettings,
  readAgentEntries,
  resolveAgentEntry,
  writeAgentEntries,
  type AgentKind
} from './settings'

export { runHeadlessAgent, type RunAgentInput, type RunAgentResult } from './runner'
