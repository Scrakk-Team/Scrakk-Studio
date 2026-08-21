/**
 * ReadFileCard — custom display for read_file tool.
 * Shows file path, line count, and content preview.
 */

import type { JSX } from 'react'

interface ReadFileCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function ReadFileCard({ args: _args, result, status: _status }: ReadFileCardProps): JSX.Element | null {
  if (!result) return null

  let parsed: { path?: string; content?: string; total_lines?: number } = {}
  try {
    parsed = JSON.parse(result)
  } catch {
    return <pre className="read-file-card__raw">{result}</pre>
  }

  const { path, content, total_lines } = parsed
  const lineCount = content ? content.split('\n').length : 0
  const preview = content ? content.split('\n').slice(0, 8).join('\n') : ''
  const hasMore = lineCount > 8

  return (
    <div className="read-file-card">
      {path && (
        <div className="read-file-card__meta">
          <span className="read-file-card__path">{path}</span>
          {total_lines !== undefined && (
            <span className="read-file-card__lines">{total_lines} líneas</span>
          )}
        </div>
      )}
      {preview && (
        <pre className="read-file-card__preview">
          {preview}
          {hasMore && '\n...'}
        </pre>
      )}
    </div>
  )
}
