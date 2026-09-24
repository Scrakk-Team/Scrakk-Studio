// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Types for the AI command processor pipeline
 */

import type { ToolCall } from '../tools'

export interface ProcessedToolCall extends ToolCall {
  originalArguments: string
  processedArguments: string
  validationErrors: string[]
  isValid: boolean
}

export interface ProcessingResult {
  toolCall: ProcessedToolCall
  success: boolean
  errors: string[]
}

export interface ContentValidation {
  isValid: boolean
  errors: string[]
  warnings: string[]
}
