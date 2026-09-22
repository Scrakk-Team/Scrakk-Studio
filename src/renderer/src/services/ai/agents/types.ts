/**
 * Agentes — tipos del sistema unificado.
 *
 * Un AGENTE es el concepto único que antes estaba partido en dos:
 * - `mode: 'primary'`  → lo que la UI llamaba "Modo" (el agente activo del chat).
 * - `mode: 'subagent'` → agentes reusables que un primario invoca (tool `task`
 *   o mención `@nombre` en el input).
 *
 * Comparten schema: prompt propio, permisos, tools y modelo. Los primarios
 * además declaran qué subagentes pueden invocar.
 */

import type { ModeMutationBehavior, ModeShellBehavior } from '../policy/types'

export type AgentMode = 'primary' | 'subagent' | 'all'

export interface AgentToolFilter {
  include?: string[]
  exclude?: string[]
}

export interface AgentPermissions {
  mutationBehavior: ModeMutationBehavior
  shellBehavior: ModeShellBehavior
  promptPolicy?: 'ask' | 'deny' | 'auto'
  acceptEdits?: boolean
  bypassPermissions?: boolean
}

/** Perfil resuelto (lo que consumen policy, prompts, tools y el runner). */
export interface AgentProfile {
  id: string
  label: string
  description?: string
  icon?: string
  color?: string
  mode: AgentMode
  prompt: string
  /** `'inherit'` usa el modelo del chat activo (como el CLI). */
  model: string
  reasoningEffort?: string
  tools: AgentToolFilter
  permissions: AgentPermissions
  /** Filtro NO relajable (ej. un subagente read-only no puede editar). */
  hardPermissions?: AgentToolFilter
  /** Ids de subagentes reusables que este primario puede invocar. */
  subagents?: string[]
  extensionId?: string
}

/** Overrides de permisos de una entrada (patrón del viejo `ModeOverrides`). */
export interface AgentPermissionsOverride {
  mutationBehavior?: ModeMutationBehavior
  shellBehavior?: ModeShellBehavior
  promptPolicy?: 'ask' | 'deny' | 'auto'
  acceptEdits?: boolean
  bypassPermissions?: boolean
}

/** Entrada persistida en `.scrakk/agents/*.json`. */
export interface AgentEntry {
  id: string
  label: string
  description?: string
  icon?: string
  color?: string
  mode?: AgentMode
  /** Preset base (id de un modo integrado) del que hereda permisos. */
  base?: string
  prompt?: string
  /** `'inherit'` (default) o un id de modelo. */
  model?: string
  reasoningEffort?: string
  tools?: AgentToolFilter
  overrides?: AgentPermissionsOverride
  /** Solo primarios: ids de subagentes habilitados. */
  subagents?: string[]
}

export const AGENT_MODEL_INHERIT = 'inherit'
