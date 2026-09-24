// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  timestamp: number
  /** Razonamiento del modelo (si piensa) — se muestra en el bloque "Thought". */
  reasoning?: string
  /** Tool calls emitted by the assistant in this message. */
  tool_calls?: ToolCallInfo[]
  /** Results for the tool calls above (indexed by call id). */
  tool_results?: Record<string, ToolResultInfo>
}

export interface ChatReply {
  content: string
}

/** Tool call info attached to a chat message. */
export interface ToolCallInfo {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** Result of a tool call. */
export interface ToolResultInfo {
  content: string
  success: boolean
  blocked?: boolean
  filePath?: string
  originalContent?: string
  modifiedContent?: string
  /** Id de sesión de un subagente lanzado (tool `task`). */
  runId?: string
}

/** Status for tool call rendering. */
export type ToolCallStatusType = 'pending' | 'streaming' | 'running' | 'success' | 'error' | 'blocked'
