/**
 * ReadFileCard — custom display for read_file tool.
 * While loading: shimmer. When done: "Read {path}".
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface ReadFileCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function ReadFileCard({ args, status }: ReadFileCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Reading file…" />
  }
  const path = typeof args.path === 'string' ? args.path : ''
  if (!path) return null
  return <span>Read {path}</span>
}
