/**
 * TaskCard — visual custom de la tool `task`.
 *
 * Shimmer mientras corre; al terminar, la línea con el subagente y su encargo
 * es **clickeable**: abre el chat del subagente dentro del panel de chat.
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
    return <ToolShimmerText text={`${label || 'Subagente'}…`} />
  }
  if (!id) return null

  const runId = execution?.runId
  const body = (
    <>
      <span className="task-card__agent">{label}</span>
      {prompt ? <span className="task-card__prompt"> · {prompt}</span> : null}
    </>
  )

  if (!runId) return <span className="task-card__static">{body}</span>

  return (
    <button
      type="button"
      className="task-card"
      title="Abrir el chat del subagente"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent('subagent:open', { detail: { sessionId: runId, title: label } })
        )
      }
    >
      {body}
    </button>
  )
}
