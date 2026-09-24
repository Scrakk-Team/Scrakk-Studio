// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ExecutionResult, ToolContext } from '../types'
import { resolvePath } from '../utils'

export async function execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const source = args.source as string
    const destination = args.destination as string
    const fullSource = resolvePath(source, ctx.projectRoot)
    const fullDest = resolvePath(destination, ctx.projectRoot)

    const exists = await window.api.fs.exists(fullSource)
    if (!exists.exists) {
      return { success: false, content: `Source not found: ${source}` }
    }

    const response = await window.api.fs.moveFile(fullSource, fullDest)

    if (response.success) {
      window.dispatchEvent(new CustomEvent('refresh-explorer'))
      return { success: true, content: `Moved: ${source} → ${destination}` }
    } else {
      return { success: false, content: `Failed to move: ${source} → ${destination}\n\n${response.error}` }
    }
  } catch (error) {
    return { success: false, content: `Error moving file: ${error}` }
  }
}
