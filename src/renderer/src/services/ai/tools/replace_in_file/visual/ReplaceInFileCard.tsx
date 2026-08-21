/**
 * ReplaceInFileCard — custom display for replace_in_file tool.
 * Shows the text replacement with diff stats.
 */

import type { JSX } from 'react'

interface ReplaceInFileCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
  originalContent?: string
  modifiedContent?: string
}

export function ReplaceInFileCard({ args, result: _result, originalContent, modifiedContent }: ReplaceInFileCardProps): JSX.Element | null {
  const oldStr = (args.old_str as string) || ''
  const newStr = (args.new_str as string) || ''

  const hasDiff = originalContent !== undefined && modifiedContent !== undefined
  const added = hasDiff ? countDiff(originalContent!, modifiedContent!) : { added: 0, removed: 0 }

  return (
    <div className="replace-file-card">
      {oldStr && (
        <div className="replace-file-card__diff">
          <div className="replace-file-card__removed">
            <span className="replace-file-card__diff-label">-</span>
            <span className="replace-file-card__diff-text">{oldStr.slice(0, 120)}{oldStr.length > 120 ? '...' : ''}</span>
          </div>
          <div className="replace-file-card__added">
            <span className="replace-file-card__diff-label">+</span>
            <span className="replace-file-card__diff-text">{newStr.slice(0, 120)}{newStr.length > 120 ? '...' : ''}</span>
          </div>
        </div>
      )}
      {hasDiff && (
        <div className="replace-file-card__stats">
          <span className="replace-file-card__stat-added">+{added.added}</span>
          <span className="replace-file-card__stat-removed">-{added.removed}</span>
        </div>
      )}
    </div>
  )
}

function countDiff(original: string, modified: string): { added: number; removed: number } {
  const origLines = new Set(original.split('\n'))
  const modLines = modified.split('\n')
  const added = modLines.filter(l => !origLines.has(l)).length
  const removed = [...origLines].filter(l => !new Set(modLines).has(l)).length
  return { added, removed }
}
