/**
 * FileSearchCard — custom display for file_search tool.
 * Shows the query and matching file names.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface FileSearchCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function FileSearchCard({ args, status }: FileSearchCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Searching files…" />
  }
  const query = typeof args.query === 'string' ? args.query : ''
  if (!query) return null
  return <span>Searched files for "{query}"</span>
}
