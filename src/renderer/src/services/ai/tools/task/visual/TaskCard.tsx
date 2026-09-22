/**
 * TaskCard — visual custom de la tool `task`.
 *
 * Shimmer mientras corre; la card es **clickeable** (también mientras corre)
 * para abrir el subagente en su modal dentro del chat.
 */

import { useEffect, useState, type JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'
import { agentRegistry, sessionIdForToolCall, subagentSessions } from '@services/ai/agents'

interface TaskCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
  /** `runId`/`toolCallId` los setea ToolCallsBlock (el 2º llega enseguida). */
  execution?: { runId?: string; toolCallId?: string }
}

export function TaskCard({ args, status, execution }: TaskCardProps): JSX.Element | null {
  // Re-render cuando cambian las sesiones (para enganchar el runId en vivo).
  const [version, setVersion] = useState(0)
  useEffect(() => subagentSessions.subscribe(() => setVersion((v) => v + 1)), [])
  void version

  const id = typeof args.subagent_type === 'string' ? args.subagent_type : ''
  const prompt = typeof args.prompt === 'string' ? args.prompt : ''
  const label = agentRegistry.getSubagent(id)?.label ?? id
  const runId =
    execution?.runId ??
    (execution?.toolCallId ? sessionIdForToolCall(execution.toolCallId) : undefined)

  const open = (): void => {
    if (!runId) return
    window.dispatchEvent(
      new CustomEvent('subagent:open', { detail: { sessionId: runId, title: label } })
    )
  }

  if (status === 'pending' || status === 'streaming' || status === 'running') {
    const shimmer = <ToolShimmerText text={`${label || 'Subagente'}…`} />
    return runId ? (
      <button type="button" className="task-card" title="Abrir el subagente" onClick={open}>
        {shimmer}
      </button>
    ) : (
      shimmer
    )
  }
  if (!id) return null

  const body = (
    <>
      <span className="task-card__agent">{label}</span>
      {prompt ? <span className="task-card__prompt"> · {prompt}</span> : null}
    </>
  )
  if (!runId) return <span className="task-card__static">{body}</span>
  return (
    <button type="button" className="task-card" title="Abrir el subagente" onClick={open}>
      {body}
    </button>
  )
}
