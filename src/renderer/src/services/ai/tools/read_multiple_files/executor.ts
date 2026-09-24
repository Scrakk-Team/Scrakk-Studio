// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ExecutionResult, ToolContext } from '../types'
import { resolvePath } from '../utils'
export async function execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const paths = args.paths as string[]
    const results: Record<string, { success: boolean; content?: string; error?: string }> = {}
    for (const path of paths) {
      const fullPath = resolvePath(path, ctx.projectRoot)
      const response = await window.api.fs.readFile(fullPath)
      if (response.success && response.content !== undefined) {
        results[path] = { success: true, content: response.content }
      } else {
        results[path] = { success: false, error: response.error || 'File not found' }
      }
    }
    return { success: true, content: JSON.stringify(results, null, 2) }
  } catch (error) {
    return { success: false, content: `Error reading files: ${error}` }
  }
}
