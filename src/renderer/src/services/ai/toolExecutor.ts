// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tool executor — executes tool calls from AI.
 * Uses Registry dispatch + PolicyEngine + state machine.
 *
 * NOTE: All ole.* calls have been replaced with window.api.fs.* (Electron IPC).
 */

import type { ToolCall, ToolResult, ExecutionResult, ToolContext } from './tools'
import { ToolCallStatus } from './tools'
import { registry } from './tools/index'
import { processToolCall, getProcessedToolCall } from './commandProcessor'
import { policyEngine, confirmationBus } from './policy'
import { PolicyDecision } from './policy/types'
import { toolSettingsService } from './toolSettings'
import { setActiveToolSessionId } from './tools'

/** Hard ceiling for a single tool call. 90 seconds. */
const TOOL_TIMEOUT_MS = 90_000

class ToolTimeoutError extends Error {
  constructor(toolName: string, ms: number) {
    super(
      `Tool "${toolName}" exceeded the ${Math.round(ms / 1000)}s limit. ` +
      `Probable cause: the tool has an infinite loop or blocking await.`
    )
    this.name = 'ToolTimeoutError'
  }
}

async function withToolTimeout<T>(
  fn: () => Promise<T>,
  toolName: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ToolTimeoutError(toolName, TOOL_TIMEOUT_MS)),
      TOOL_TIMEOUT_MS
    )
  })
  try {
    return await Promise.race([fn(), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Stack-based session management */
const toolScopeStack: (string | null)[] = []
const toolSignalStack: (AbortSignal | undefined)[] = []

function getToolScopeSessionId(): string | null {
  for (let i = toolScopeStack.length - 1; i >= 0; i--) {
    if (toolScopeStack[i]) return toolScopeStack[i]
  }
  return null
}

function getProjectRoot(): string {
  // En Electron, la raíz del proyecto la setea el Explorer (panel de archivos).
  try {
    return localStorage.getItem('scrakk-studio:root-path') ?? ''
  } catch {
    // Sin storage disponible (tests/SSR): raíz vacía.
    return ''
  }
}

function getCurrentToolSignal(): AbortSignal | undefined {
  for (let i = toolSignalStack.length - 1; i >= 0; i--) {
    if (toolSignalStack[i]) return toolSignalStack[i]
  }
  return undefined
}

/**
 * Execute a tool call and return the result.
 */
export async function executeTool(toolCall: ToolCall, signal?: AbortSignal): Promise<{ result: ToolResult; execution: ExecutionResult }> {
  try {
    // Step 1: Process the tool call through the pipeline (convert + validate)
    const processingResult = processToolCall(toolCall)

    if (!processingResult.success) {
      const joinedErrors = processingResult.errors.join(', ')
      console.error(`Tool call validation failed for ${toolCall.function.name}:`, processingResult.errors)
      return {
        result: {
          tool_call_id: toolCall.id,
          role: 'tool',
          content: `Validation error: ${joinedErrors}. Please re-emit the call with valid arguments.`,
        },
        execution: {
          success: false,
          content: `Validation error: ${joinedErrors}`,
        }
      }
    }

    const processedToolCall = getProcessedToolCall(processingResult)
    const { name, arguments: argsStr } = processedToolCall.function

    let args: Record<string, unknown>
    try {
      args = JSON.parse(argsStr)
    } catch {
      args = {}
    }

    console.log(`Executing tool: ${name}`, args)

    // Check tool exists in registry
    const activeSessionId = getToolScopeSessionId()

    if (name !== 'multiple_tools') {
      const exists = registry.get(name)
      if (!exists) {
        const err = `Tool "${name}" is not registered.`
        console.warn(`[executeTool] ${err}`)
        return {
          result: { tool_call_id: toolCall.id, role: 'tool', content: err },
          execution: { success: false, content: err, state: ToolCallStatus.Error },
        }
      }

      if (!toolSettingsService.isEnabledForSession(activeSessionId, name)) {
        const err = `Tool "${name}" is disabled.`
        console.warn(`[executeTool] ${err}`)
        return {
          result: { tool_call_id: toolCall.id, role: 'tool', content: err },
          execution: {
            success: false,
            content: err,
            state: ToolCallStatus.Rejected,
            blocked: true,
          },
        }
      }
    }

    const projectRoot = getProjectRoot()
    let execution: ExecutionResult

    try {
      if (name === 'multiple_tools') {
        execution = await executeMultipleTools(args, toolCall, signal)
      } else {
        execution = await executeRegistryTool(name, args, projectRoot, activeSessionId, toolCall)
      }
    } catch (dispatchError) {
      const msg = dispatchError instanceof Error ? dispatchError.message : String(dispatchError)
      console.error(`[executeTool] Dispatch error for ${name}:`, dispatchError)
      execution = {
        success: false,
        content: `Error executing "${name}": ${msg}`,
        state: ToolCallStatus.Error,
      }
    }

    console.log(`Tool ${name} result:`, execution)

    return {
      result: { tool_call_id: toolCall.id, role: 'tool', content: execution.content },
      execution,
    }
  } catch (topLevelError) {
    const msg = topLevelError instanceof Error ? topLevelError.message : String(topLevelError)
    console.error(`[executeTool] Unexpected error for ${toolCall.function.name}:`, topLevelError)
    return {
      result: {
        tool_call_id: toolCall.id,
        role: 'tool',
        content: `Internal error executing tool "${toolCall.function.name}": ${msg}. The conversation will continue.`,
      },
      execution: {
        success: false,
        content: `Internal error executing tool "${toolCall.function.name}": ${msg}`,
        state: ToolCallStatus.Error,
      },
    }
  }
}

async function executeRegistryTool(
  name: string,
  args: Record<string, unknown>,
  projectRoot: string,
  sessionId: string | null,
  _toolCall: ToolCall
): Promise<ExecutionResult> {
  // Policy engine check
  const policyResult = await policyEngine.checkTool(name, args)
  if (policyResult.decision === PolicyDecision.DENY) {
    return {
      success: false,
      content: `[POLICY] ${policyResult.reason}`,
      blocked: true,
      state: ToolCallStatus.Rejected,
    }
  }

  if (policyResult.decision === PolicyDecision.ASK_USER) {
    const response = await confirmationBus.requestConfirmation(
      policyResult.reason,
      policyResult.shellSafety
        ? `Risk: ${policyResult.shellSafety.riskLevel}\nCommand: ${policyResult.shellSafety.command}`
        : `Tool: ${name}`,
      name,
      args,
      {
        riskLevel: policyResult.shellSafety?.riskLevel,
        details: policyResult.shellSafety?.reasons,
      },
    )

    if (response === 'rejected') {
      return {
        success: false,
        content: `[USER REJECTED] ${policyResult.reason}`,
        blocked: true,
        state: ToolCallStatus.Rejected,
      }
    }

    if (response === 'approved_always') {
      toolSettingsService.setApprovalMode('all_allow')
    }
  }

  const tool = registry.get(name)
  if (!tool) {
    return {
      success: false,
      content: `Tool "${name}" is not registered.`,
      state: ToolCallStatus.Error,
    }
  }

  const ctx: ToolContext = { projectRoot, sessionId, signal: getCurrentToolSignal(), toolCallId: _toolCall.id }
  try {
    const result = await withToolTimeout(
      () => tool.execute(args, ctx),
      name,
    )
    if (!result || typeof result !== 'object') {
      return {
        success: false,
        content: `Tool "${name}" returned ${result === null ? 'null' : typeof result} instead of ExecutionResult.`,
        state: ToolCallStatus.Error,
      }
    }
    return { ...result, state: result.success ? ToolCallStatus.Success : ToolCallStatus.Error }
  } catch (error) {
    return { success: false, content: `Error executing ${name}: ${error}`, state: ToolCallStatus.Error }
  }
}

async function executeMultipleTools(
  args: Record<string, unknown>,
  toolCall: ToolCall,
  signal?: AbortSignal
): Promise<ExecutionResult> {
  try {
    const subTools = (args.tools as Array<{ tool_name: string; arguments: unknown; wait_for_previous?: boolean }>) || []
    const results: Array<Record<string, unknown>> = []
    let hasError = false

    for (let i = 0; i < subTools.length; i++) {
      const subTool = subTools[i]

      const fakeToolCall: ToolCall = {
        id: `${toolCall.id}-sub-${i}`,
        type: 'function',
        function: {
          name: subTool.tool_name,
          arguments: JSON.stringify(subTool.arguments),
        },
      }

      const { execution: subExec } = await executeTool(fakeToolCall, signal)

      results.push({
        tool_name: subTool.tool_name,
        success: subExec.success,
        content: subExec.content,
        originalContent: subExec.originalContent,
        modifiedContent: subExec.modifiedContent,
        filePath: subExec.filePath,
      })

      if (!subExec.success) {
        hasError = true
      }
    }

    return {
      success: !hasError,
      content: JSON.stringify({ results, aborted: hasError }, null, 2),
      state: ToolCallStatus.Success,
    }
  } catch (e) {
    return { success: false, content: String(e), state: ToolCallStatus.Error }
  }
}

/**
 * Execute multiple tool calls sequentially.
 */
export async function executeTools(
  toolCalls: ToolCall[],
  sessionId?: string,
  signal?: AbortSignal
): Promise<Array<{ result: ToolResult; execution: ExecutionResult }>> {
  toolScopeStack.push(sessionId ?? null)
  toolSignalStack.push(signal)
  setActiveToolSessionId(sessionId ?? null)
  try {
    const results: Array<{ result: ToolResult; execution: ExecutionResult }> = []
    for (const tc of toolCalls) {
      if (signal?.aborted) {
        results.push({
          result: { role: 'tool' as const, content: '[Aborted by user]', tool_call_id: tc.id },
          execution: { success: false, content: '[Aborted]' },
        })
        continue
      }
      results.push(await executeTool(tc, signal))
    }
    return results
  } finally {
    toolScopeStack.pop()
    toolSignalStack.pop()
    let prev: string | null = null
    for (let i = toolScopeStack.length - 1; i >= 0; i--) {
      if (toolScopeStack[i]) {
        prev = toolScopeStack[i]
        break
      }
    }
    setActiveToolSessionId(prev)
  }
}
