/**
 * WebFetchCard — muestra la URL leída y cuánto contenido llegó.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'
import './WebFetchCard.css'

interface WebFetchCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function WebFetchCard({ args, result, status }: WebFetchCardProps): JSX.Element | null {
  const url = typeof args.url === 'string' ? args.url : ''
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text={url ? `Fetching: ${url}…` : 'Fetching page…'} />
  }
  if (!url) return null
  const chars = result?.length ?? 0
  return (
    <span className="web-fetch-card">
      Fetched: {url}
      {chars > 0 ? <span className="web-fetch-card__size"> · {chars.toLocaleString()} chars</span> : null}
    </span>
  )
}
