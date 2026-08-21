/**
 * WriteFileCard — custom display for write_file tool.
 * Shows file path and content stats (lines added/removed).
 */

import type { JSX } from 'react'

interface WriteFileCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
  originalContent?: string
  modifiedContent?: string
}

export function WriteFileCard({ args, result: _result, originalContent, modifiedContent }: WriteFileCardProps): JSX.Element | null {
  const path = (args.path as string) || ''
  const content = (args.content as string) || ''
  void path // reserved for future display

  const lines = content ? content.split('\n').length : 0
  const hasDiff = originalContent !== undefined && modifiedContent !== undefined
  const added = hasDiff ? countAddedLines(originalContent!, modifiedContent!) : lines
  const removed = hasDiff ? countRemovedLines(originalContent!, modifiedContent!) : 0

  return (
    <div className="write-file-card">
      <div className="write-file-card__stats">
        <span className="write-file-card__lines">{lines} líneas</span>
        {hasDiff && (
          <>
            <span className="write-file-card__added">+{added}</span>
            <span className="write-file-card__removed">-{removed}</span>
          </>
        )}
      </div>
    </div>
  )
}

function countAddedLines(original: string, modified: string): number {
  const origLines = new Set(original.split('\n'))
  const modLines = modified.split('\n')
  return modLines.filter(l => !origLines.has(l)).length
}

function countRemovedLines(original: string, modified: string): number {
  const modLines = new Set(modified.split('\n'))
  const origLines = original.split('\n')
  return origLines.filter(l => !modLines.has(l)).length
}
