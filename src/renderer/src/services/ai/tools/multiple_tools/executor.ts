// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ExecutionResult, ToolContext } from '../types'
export async function execute(_args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  return { success: true, content: 'multiple_tools is handled by the toolExecutor directly.' }
}
