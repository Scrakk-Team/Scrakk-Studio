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

    // Read original content if file exists
    let originalContent = ''
    const existing = await window.api.fs.readFile(fullPath)
    if (existing.success && existing.content !== undefined) {
      originalContent = existing.content
    }

    const response = await window.api.fs.writeFile(fullPath, content)

    if (response.success) {
      window.dispatchEvent(new CustomEvent('refresh-explorer'))

      // Gancho LSP post-edición: sync + drain → <lsp-diagnostics> al contexto.
      const lspBlock = await lspAfterEdit(fullPath, content)

      if (originalContent) {
        window.dispatchEvent(new CustomEvent('file-changed', {
          detail: {
            path: fullPath,
            originalContent,
            modifiedContent: content
          }
        }))
      }

      return {
        success: true,
        content: `File ${originalContent ? 'updated' : 'created'}: ${path}` + (lspBlock ? `\n\n${lspBlock}` : ''),
        filePath: path,
        originalContent,
        modifiedContent: content
      }
    } else {
      return {
        success: false,
        content: `ERROR: Failed to write file: ${path}\n\nFull path: ${fullPath}\n\n${response.error}`
      }
    }
  } catch (error) {
    return { success: false, content: `ERROR writing file: ${args.path}\n\n${error}` }
  }
}
