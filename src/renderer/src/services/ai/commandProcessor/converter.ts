// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Converter — path normalization for tool-call arguments.
 * Step 1 of the command processing pipeline.
 *
 * IMPORTANT: it does NOT touch the CONTENT fields. After `JSON.parse` the strings
 * already hold the exact characters the model sent, so "repairing" escapes a
 * second time (turning a literal `\n` into a newline, `&amp;` into `&`, …)
 * corrupts real code (Python, regexes, Windows paths, HTML). Other harnesses
 * decode the arguments exactly once and write the string verbatim.
 */

const IS_WINDOWS: boolean =
  typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || navigator.userAgent || '')

/**
 * Normalize a path argument for the host OS.
 */
export function normalizePathArgument(p: string, isWindows: boolean): string {
  if (!p || typeof p !== 'string') return p
  let result = p

  // Strip leading ./
  if (result.startsWith('./') || result.startsWith('.\\')) {
    result = result.slice(2)
  }

  // Normalize separators
  if (isWindows) {
    result = result.replace(/\//g, '\\')
  } else {
    result = result.replace(/\\/g, '/')
  }

  // Collapse repeated separators
  const sep = isWindows ? '\\' : '/'
  result = result.replace(new RegExp(`${sep === '\\' ? '\\\\' : '/'}+`, 'g'), sep)

  return result
}

/**
 * Process tool call arguments and convert escape sequences in content fields.
 * Also normalizes path arguments to the host OS path style.
 */
export function convertToolCallArguments(argsString: string, isWindows: boolean = IS_WINDOWS): string {
  try {
    // Some gateways double-encode the arguments (a JSON string that contains the
    // JSON). Decode the extra layer — but NEVER touch the content the model sent:
    // the first `JSON.parse` already produced the exact characters.
    let args = JSON.parse(argsString) as unknown
    for (let i = 0; i < 2 && typeof args === 'string'; i += 1) {
      args = JSON.parse(args) as unknown
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) return argsString
    const record = args as Record<string, unknown>

    // Path normalization (content fields are left verbatim)
    for (const field of ['path', 'file_path', 'source', 'destination', 'old_path', 'new_path', 'target_directory']) {
      if (record[field] && typeof record[field] === 'string') {
        record[field] = normalizePathArgument(record[field] as string, isWindows)
      }
    }

    // For multiple_tools, recurse into each sub-tool's arguments
    if (Array.isArray(record.tools)) {
      record.tools = record.tools.map((sub: unknown) => {
        if (sub && typeof sub === 'object' && 'arguments' in (sub as object)) {
          const subTool = sub as { tool_name?: string; arguments?: unknown }
          if (
            subTool.arguments &&
            typeof subTool.arguments === 'object' &&
            !Array.isArray(subTool.arguments)
          ) {
            subTool.arguments = JSON.parse(
              convertToolCallArguments(JSON.stringify(subTool.arguments), isWindows)
            )
          }
          return subTool
        }
        return sub
      })
    }

    return JSON.stringify(record)
  } catch (e) {
    console.error('[Converter] Failed to parse arguments:', e)
    return argsString
  }
}
