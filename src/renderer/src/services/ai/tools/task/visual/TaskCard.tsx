/**
 * TaskCard — visual de la tool `task`, IGUAL que cualquier otra tool:
 * shimmer mientras corre y una línea de texto al terminar.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'
import { agentRegistry } from '@services/ai/agents'

interface TaskCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function TaskCard({ args, status }: TaskCardProps): JSX.Element | null {
  const id = typeof args.subagent_type === 'string' ? args.subagent_type : ''
  const prompt = typeof args.prompt === 'string' ? args.prompt : ''
  const label = agentRegistry.getSubagent(id)?.label ?? id

  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text={`${label || 'Subagente'}…`} />
  }
  if (!id) return null
  return (
    <span>
      {label}
      {prompt ? ` · ${prompt}` : ''}
    </span>
  )
}
