/**
 * HistoryTitleCard — custom display for history_title tool.
 * Shows the conversation title that was set.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface HistoryTitleCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function HistoryTitleCard({ args, status }: HistoryTitleCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Setting title…" />
  }
  const title = typeof args.title === 'string' ? args.title : ''
  if (!title) return null
  return <span>Set title: {title}</span>
}
