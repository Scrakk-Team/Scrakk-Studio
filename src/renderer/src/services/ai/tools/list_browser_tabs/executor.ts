// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ExecutionResult, ToolContext } from '../types'
export async function execute(_args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  window.dispatchEvent(new CustomEvent('list-browser-tabs'))
  return { success: true, content: 'Listing browser tabs. Check the browser panel.' }
}
