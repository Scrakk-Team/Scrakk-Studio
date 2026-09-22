/**
 * TaskCard — visual de la tool `task`: muestra el subagente invocado, su
 * encargo y un botón "Abrir" para meterse al chat del subagente en vivo.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'
import { agentRegistry } from '@services/ai/agents'

interface TaskCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
  execution?: { runId?: string }
}

export function TaskCard({ args, status, execution }: TaskCardProps): JSX.Element | null {
  const id = typeof args.subagent_type === 'string' ? args.subagent_type : ''
  const prompt = typeof args.prompt === 'string' ? args.prompt : ''
  const label = agentRegistry.getSubagent(id)?.label ?? id

  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text={`Lanzando ${label || 'subagente'}…`} />
  }
  if (!id) return null

  const openSubagent = (): void => {
    if (!execution?.runId) return
    window.dispatchEvent(
      new CustomEvent('subagent:open', {
        detail: { sessionId: execution.runId, title: label }
      })
    )
  }

  return (
    <span className="task-card">
      <span className="task-card__agent">{label}</span>
      {prompt ? <span className="task-card__prompt">{prompt}</span> : null}
      {execution?.runId ? (
        <button type="button" className="task-card__open" onClick={openSubagent}>
          Abrir
        </button>
      ) : null}
    </span>
  )
}
