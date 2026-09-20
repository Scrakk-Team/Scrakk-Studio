/**
 * WebSearchCard — muestra la consulta y cuántos resultados llegaron.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'
import './WebSearchCard.css'

interface WebSearchCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function WebSearchCard({ args, status }: WebSearchCardProps): JSX.Element | null {
  const query = typeof args.query === 'string' ? args.query : ''
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text={query ? `Searching: ${query}…` : 'Searching the web…'} />
  }
  if (!query) return null
  return <span className="web-search-card">Searched: {query}</span>
}
