// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ExecutionResult, ToolContext } from '../types'
import { resolvePath } from '../utils'
import { lspAfterEdit } from '../../../lsp'

export async function execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const path = args.path as string
    const content = args.content as string
    const fullPath = resolvePath(path, ctx.projectRoot)

    const existing = await window.api.fs.readFile(fullPath)
    if (!existing.success || existing.content === undefined) {
      return {
        success: false,
        content: `ERROR: File not found: ${path}\n\nCannot append to a file that doesn't exist. Use write_file to create it first.`
      }
    }

    const newContent = existing.content + content
    const response = await window.api.fs.writeFile(fullPath, newContent)

    if (response.success) {
      window.dispatchEvent(new CustomEvent('refresh-explorer'))
      window.dispatchEvent(new CustomEvent('file-changed', {
        detail: { path: fullPath, originalContent: existing.content, modifiedContent: newContent }
      }))
      const lspBlock = await lspAfterEdit(fullPath, newContent)
      return { success: true, content: `Appended to: ${path}` + (lspBlock ? `\n\n${lspBlock}` : ''), filePath: path, originalContent: existing.content, modifiedContent: newContent }
    } else {
      return { success: false, content: `ERROR: Failed to append to: ${path}\n\n${response.error}` }
    }
  } catch (error) {
    return { success: false, content: `Error appending to file: ${error}` }
  }
}
