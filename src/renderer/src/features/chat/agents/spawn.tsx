/**
 * spawnSubagentChat — API global para spawnear el CHAT de un subagente.
 *
 * Abre un modal global `plain` (sin overlay) cuyo contenido es el propio
 * componente de chat del subagente. Mientras está abierto, el input del chat
 * principal queda bloqueado (`subagentSessions.isViewOpen()`).
 */

import { showModal } from '@services/modals'
import { agentRegistry, startSubagentSession, subagentSessions } from '@services/ai/agents'
import { SubagentChatView } from './SubagentChatView'
import type { SpawnTexts } from './types'

export interface SpawnSubagentInput {
  agentId: string
  prompt: string
  /** Sesión del chat principal (para el scope de tools). */
  sessionId?: string | null
  /** Textos custom del spawn. */
  texts?: SpawnTexts
}

export interface SpawnSubagentResult {
  sessionId: string
  modalId: string
}

export function spawnSubagentChat(input: SpawnSubagentInput): SpawnSubagentResult | null {
  const agent = agentRegistry.getSubagent(input.agentId)
  if (!agent) return null

  const sessionId = startSubagentSession(agent, input.prompt, { sessionId: input.sessionId })
  subagentSessions.setViewOpen(true)

  const handle = showModal({
    title: input.texts?.title ?? agent.label,
    variant: 'plain',
    render: ({ close }) => (
      <SubagentChatView sessionId={sessionId} texts={input.texts} onClose={close} />
    ),
    onClose: () => subagentSessions.setViewOpen(false)
  })
  return { sessionId, modalId: handle.id }
}
