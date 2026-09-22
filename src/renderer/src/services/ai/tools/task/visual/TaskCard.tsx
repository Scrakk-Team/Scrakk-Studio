/**
 * TaskCard — visual de la tool `task`: muestra el subagente invocado y su
 * encargo, en una sola línea.
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
    return <ToolShimmerText text={`Lanzando ${label || 'subagente'}…`} />
  }
  if (!id) return null
  return (
    <span className="task-card">
      <span className="task-card__agent">{label}</span>
      {prompt ? <span className="task-card__prompt">{prompt}</span> : null}
    </span>
  )
}
