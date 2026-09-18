/**
 * AppendFileCard — custom display for append_file tool.
 * Shows the target path and a preview of the appended content.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface AppendFileCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function AppendFileCard({ args, status }: AppendFileCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Appending to file…" />
  }
  const path = typeof args.path === 'string' ? args.path : ''
  if (!path) return null
  return <span>Appended to {path}</span>
}
