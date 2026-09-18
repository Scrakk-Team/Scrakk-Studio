/**
 * ViewWebCard — custom display for view_web tool.
 * Shows the fetched URL.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface ViewWebCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function ViewWebCard({ args, status }: ViewWebCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Reading web…" />
  }
  const url = typeof args.url === 'string' ? args.url : ''
  if (!url) return null
  return <span>Read {url}</span>
}
