// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Converter - Converts escape sequences to real characters
 * Step 1 of the command processing pipeline
 *
 * The problem: AI sometimes sends \\n (escaped) instead of real newlines in JSON.
 * After JSON.parse, \\n becomes \n (literal backslash + n), not a newline.
 * We need to convert these literal \n to real newlines.
 */

const IS_WINDOWS: boolean =
  typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || navigator.userAgent || '')

/**
 * Convert HTML entities to their actual characters
 */
export function convertHtmlEntities(content: string): string {
  if (!content || typeof content !== 'string') {
    return content
  }

  const htmlEntities: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#47;': '/',
    '&nbsp;': ' '
  }

  let result = content

  for (const [entity, char] of Object.entries(htmlEntities)) {
    result = result.split(entity).join(char)
  }

  // Also handle numeric entities
  result = result.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

  return result
}

/**
 * Convert literal escape sequences in a string to their actual characters
 */
export function convertEscapeSequences(content: string): string {
  if (!content || typeof content !== 'string') {
    return content
  }

  let result = content

  // First convert HTML entities
  result = convertHtmlEntities(result)

  // Protect escaped backslashes
  const bsPlaceholder = '\x00BS\x00'
  result = result.replace(/\\\\/g, bsPlaceholder)

  // Convert \n \t \r (literal two-char sequences) to real chars
  result = result.replace(/\\n/g, '\n')
  result = result.replace(/\\t/g, '\t')
  result = result.replace(/\\r/g, '\r')

  // Restore escaped backslashes
  result = result.replace(new RegExp(bsPlaceholder, 'g'), '\\')

  return result
}

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
    const args = JSON.parse(argsString)

    // String fields that may contain AI-escaped newlines/tabs/CRs/HTML
    const fieldsToConvert = ['content', 'old_str', 'new_str', 'command', 'query', 'explanation']
    for (const field of fieldsToConvert) {
      if (args[field] && typeof args[field] === 'string') {
        args[field] = convertEscapeSequences(args[field])
      }
    }

    // Path normalization
    for (const field of ['path', 'file_path', 'source', 'destination', 'old_path', 'new_path', 'target_directory']) {
      if (args[field] && typeof args[field] === 'string') {
        args[field] = normalizePathArgument(args[field], isWindows)
      }
    }

    // For multiple_tools, recurse into each sub-tool's arguments
    if (Array.isArray(args.tools)) {
      args.tools = args.tools.map((sub: unknown) => {
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

    return JSON.stringify(args)
  } catch (e) {
    console.error('[Converter] Failed to parse arguments:', e)
    return argsString
  }
}
