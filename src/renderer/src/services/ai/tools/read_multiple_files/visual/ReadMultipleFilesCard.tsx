/**
 * ReadMultipleFilesCard — custom display for read_multiple_files tool.
 * Lists each requested path with success/error state.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface ReadMultipleFilesCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function ReadMultipleFilesCard({ args, status }: ReadMultipleFilesCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Reading files…" />
  }
  const paths = Array.isArray(args.paths) ? args.paths.map(String) : []
  if (paths.length === 0) return null
  return <span>Read {paths.length} files</span>
}
