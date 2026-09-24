// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ExecutionResult, ToolContext } from '../types'
import { resolvePath } from '../utils'

export async function execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const path = args.path as string
    const fullPath = resolvePath(path, ctx.projectRoot)

    const exists = await window.api.fs.exists(fullPath)
    if (!exists.exists) {
      return { success: false, content: `File not found: ${path}` }
    }

    const response = await window.api.fs.deleteFile(fullPath)

    if (response.success) {
      window.dispatchEvent(new CustomEvent('refresh-explorer'))
      return { success: true, content: `Deleted: ${path}` }
    } else {
      return { success: false, content: `Failed to delete: ${path}\n\n${response.error}` }
    }
  } catch (error) {
    return { success: false, content: `Error deleting file: ${error}` }
  }
}
