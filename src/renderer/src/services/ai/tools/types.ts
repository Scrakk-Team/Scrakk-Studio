/**
 * Common types for the modular tool system
 */

export enum ToolCallStatus {
  Pending = 'pending',
  Validating = 'validating',
  AwaitingApproval = 'awaiting_approval',
  Executing = 'executing',
  Success = 'success',
  Error = 'error',
  Rejected = 'rejected',
  Cancelled = 'cancelled',
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolResult {
  tool_call_id: string
  role: 'tool'
  content: string
}

export interface StateMachineResult {
  status: ToolCallStatus
  content: string
  filePath?: string
  originalContent?: string
  modifiedContent?: string
  blocked?: boolean
  error?: string
}

export interface ExecutionResult {
  success: boolean
  content: string
  filePath?: string
  originalContent?: string
  modifiedContent?: string
  blocked?: boolean
  state?: ToolCallStatus
}

export interface ToolContext {
  projectRoot: string
  sessionId: string | null
  signal?: AbortSignal
}

export type PermissionType =
  | 'path_block'
  | 'path_allow'
  | 'size_limit'
  | 'depth_limit'
  | 'command_prefix'
  | 'extension_filter'
  | 'count_limit'

export interface PermissionRule {
  id: string
  type: PermissionType
  label: string
  description: string
  defaultAllowed: boolean
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

import type React from 'react'

export interface ToolMeta {
  name: string
  label: string
  description: string
  category: 'file' | 'code' | 'browser' | 'system' | 'agent' | 'utility' | 'extension'
  dangerLevel: 'safe' | 'low' | 'medium' | 'high'
  enabledByDefault: boolean

  // ── Display API ─────────────────────────────────────────────────────────
  /** Icon identifier or SVG string for the tool icon */
  icon?: string
  /** CSS string injected when this tool's card is rendered */
  displayCss?: string
  /** Args key(s) to show in the card header (e.g. 'path', 'command', 'query') */
  headerArgKey?: string | string[]
  /** Whether the card body is expandable (chevron). Default: true. */
  expandable?: boolean
  /** Render sin fondo: una sola línea de texto (ej. read_file → "Leí {path}"). */
  plain?: boolean
  /** Texto fijo que precede al arg en modo plain (ej. "Leí"). */
  plainText?: string
  /** Custom body renderer — overrides the default details view */
  renderBody?: (args: Record<string, unknown>, result?: string, status?: string) => React.ReactNode
}

export type ToolMutationBehavior = 'always' | 'never' | 'shell'

export interface Tool {
  name: string
  definition: ToolDefinition
  permissions: PermissionRule[]
  meta?: ToolMeta
  /** Prompt fragment that describes this tool to the AI. */
  prompt?: string
  /** Whether this tool mutates the workspace. */
  mutationBehavior?: ToolMutationBehavior
  /** Extension ID if the tool was contributed by an extension. */
  extensionId?: string
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult>
}
