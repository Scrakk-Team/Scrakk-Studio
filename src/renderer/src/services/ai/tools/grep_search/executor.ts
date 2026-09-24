// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ExecutionResult, ToolContext } from '../types'

export async function execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const response = await window.api.fs.searchInFiles(
      ctx.projectRoot,
      args.query as string,
      args.include_pattern as string | undefined,
      args.case_sensitive as boolean | undefined,
      50
    )

    if (!response.success) {
      return { success: false, content: `Error searching in files: ${response.error}` }
    }

    return {
      success: true,
      content: JSON.stringify(response.matches, null, 2)
    }
  } catch (error) {
    return { success: false, content: `Error searching in files: ${error}` }
  }
}
