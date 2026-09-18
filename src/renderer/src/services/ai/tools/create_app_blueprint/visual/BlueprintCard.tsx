/**
 * BlueprintCard — custom display for create_app_blueprint tool.
 * Shows app name, features and tech stack.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface BlueprintCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function BlueprintCard({ args, status }: BlueprintCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Creating blueprint…" />
  }
  const name = typeof args.name === 'string' ? args.name : ''
  if (!name) return null
  return <span>Created blueprint {name}</span>
}
