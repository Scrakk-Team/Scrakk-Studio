// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Command Processor - Main pipeline for processing AI tool calls
 * Pipeline: Convert -> Validate -> Return processed tool call
 */

import type { ToolCall } from '../tools'
import type { ProcessedToolCall, ProcessingResult } from './types'
import { convertToolCallArguments } from './converter'
import { validateToolCall } from './validator'

const IS_WINDOWS: boolean =
  typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || navigator.userAgent || '')

/**
 * Process a single tool call through the pipeline
 */
export function processToolCall(toolCall: ToolCall): ProcessingResult {
  const originalArguments = toolCall.function.arguments

  // Step 1: Convert escape sequences + normalize paths
  const processedArguments = convertToolCallArguments(originalArguments, IS_WINDOWS)

  // Step 2: Validate
  const validation = validateToolCall(toolCall.function.name, processedArguments)

  // Create processed tool call
  const processedToolCall: ProcessedToolCall = {
    ...toolCall,
    function: {
      ...toolCall.function,
      arguments: processedArguments
    },
    originalArguments,
    processedArguments,
    validationErrors: validation.errors,
    isValid: validation.isValid
  }

  // Log warnings if any
  if (validation.warnings.length > 0) {
    console.warn(`Tool call warnings for ${toolCall.function.name}:`, validation.warnings)
  }

  return {
    toolCall: processedToolCall,
    success: validation.isValid,
    errors: validation.errors
  }
}

/**
 * Process multiple tool calls
 */
export function processToolCalls(toolCalls: ToolCall[]): ProcessingResult[] {
  return toolCalls.map(tc => processToolCall(tc))
}

/**
 * Get the processed arguments as a ToolCall (for use with existing executor)
 */
export function getProcessedToolCall(result: ProcessingResult): ToolCall {
  return {
    id: result.toolCall.id,
    type: result.toolCall.type,
    function: {
      name: result.toolCall.function.name,
      arguments: result.toolCall.processedArguments
    }
  }
}
