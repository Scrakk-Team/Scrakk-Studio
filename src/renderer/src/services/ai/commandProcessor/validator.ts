// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Validator - Validates tool call arguments against tool definitions
 * Step 2 of the command processing pipeline
 */

import { registry } from '../tools'
import type { ContentValidation } from './types'

/**
 * Validate a tool call's arguments against the tool's definition schema.
 */
export function validateToolCall(
  toolName: string,
  processedArgs: string
): ContentValidation {
  const errors: string[] = []
  const warnings: string[] = []

  // Check if tool exists
  const tool = registry.get(toolName)
  if (!tool) {
    errors.push(`Tool "${toolName}" is not registered`)
    return { isValid: false, errors, warnings }
  }

  // Parse arguments
  let args: Record<string, unknown>
  try {
    args = JSON.parse(processedArgs)
  } catch {
    errors.push(`Invalid JSON in arguments for "${toolName}"`)
    return { isValid: false, errors, warnings }
  }

  // Validate required fields
  const schema = tool.definition.function.parameters
  if (schema && typeof schema === 'object') {
    const required = (schema as Record<string, unknown>).required
    if (Array.isArray(required)) {
      for (const field of required) {
        if (typeof field === 'string' && (args[field] === undefined || args[field] === null)) {
          errors.push(`Missing required field "${field}" for tool "${toolName}"`)
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}
