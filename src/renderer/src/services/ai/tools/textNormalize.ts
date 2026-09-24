// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Text normalization utilities for file content.
 *
 * Normalizes:
 *   - UTF-8 BOM stripping
 *   - CRLF → LF conversion
 *   - Trailing whitespace stripping per line
 *   - Guaranteed final newline
 */

export interface NormalizedText {
  text: string
  hadBom: boolean
  originalLineEnding: 'lf' | 'crlf' | 'mixed'
}

/**
 * Detect the dominant line ending style in a string.
 */
export function detectLineEnding(text: string): 'lf' | 'crlf' | 'mixed' {
  const hasCrlf = text.includes('\r\n')
  // A bare \n after removing \r\n counts as a different line ending
  const strippedCrlf = text.replace(/\r\n/g, '')
  const hasBareLf = strippedCrlf.includes('\n')

  if (hasCrlf && hasBareLf) return 'mixed'
  if (hasCrlf) return 'crlf'
  return 'lf'
}

/**
 * Normalize text content for AI consumption:
 *   - Strip UTF-8 BOM
 *   - Convert CRLF to LF
 *   - Strip trailing whitespace per line
 *   - Guarantee final newline
 */
export function normalizeText(text: string): NormalizedText {
  let result = text
  let hadBom = false

  // Strip BOM
  if (result.length > 0 && result.charCodeAt(0) === 0xFEFF) {
    result = result.slice(1)
    hadBom = true
  }

  const originalLineEnding = detectLineEnding(result)

  // Normalize line endings to LF
  result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Strip trailing whitespace per line
  result = result.replace(/[ \t]+$/gm, '')

  // Guarantee final newline (unless file is empty)
  if (result.length > 0 && !result.endsWith('\n')) {
    result += '\n'
  }

  return { text: result, hadBom, originalLineEnding }
}
