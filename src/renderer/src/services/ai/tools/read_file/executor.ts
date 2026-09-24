// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Executor for read_file
 *
 * Reads a file from disk via Electron IPC and returns its content.
 * Output is normalized: BOM stripped, CRLF→LF, trailing whitespace stripped.
 */

import type { ExecutionResult, ToolContext } from '../types'
import { resolvePath } from '../utils'
import { detectLineEnding, normalizeText } from '../textNormalize'

export async function execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const path = args.path as string
    const fullPath = resolvePath(path, ctx.projectRoot)

    const response = await window.api.fs.readFile(fullPath)

    if (!response.success || response.content === undefined) {
      return {
        success: false,
        content: `ERROR: File not found: ${path}\n\nFull path attempted: ${fullPath}\n\nUse list_directory to see available files.`
      }
    }

    const content = response.content

    // Snapshot line ending BEFORE normalization
    const originalLineEnding = detectLineEnding(content)
    const hadBom = content.length > 0 && content.charCodeAt(0) === 0xFEFF

    // Normalize for the AI
    const normalized = normalizeText(content)
    let displayContent = normalized.text
    let totalLines = displayContent.length > 0
      ? displayContent.split('\n').length - 1
      : 0

    if (args.start_line || args.end_line) {
      const start = ((args.start_line as number) || 1) - 1
      const end = (args.end_line as number) || totalLines
      let lines = displayContent.split('\n')
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
      lines = lines.slice(start, end)
      displayContent = lines.length > 0 ? lines.join('\n') + '\n' : ''
    }

    const warnings: string[] = []
    if (hadBom) warnings.push('file had a UTF-8 BOM (stripped)')
    if (originalLineEnding === 'crlf') warnings.push('file used CRLF (converted to LF)')
    if (originalLineEnding === 'mixed') warnings.push('file had mixed line endings (normalized to LF)')

    return {
      success: true,
      content: JSON.stringify({
        path,
        content: displayContent,
        total_lines: totalLines,
        original_line_ending: originalLineEnding,
        had_bom: hadBom,
        normalization_warnings: warnings,
      }, null, 2)
    }
  } catch (error) {
    return { success: false, content: `ERROR reading file: ${args.path}\n\n${error}` }
  }
}
