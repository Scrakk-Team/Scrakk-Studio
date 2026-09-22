/**
 * spawnSubagentChat / openSubagentChat — API global del chat de un subagente.
 *
 * Abre el chat del subagente DENTRO del panel de chat (portal `plain`, sin
 * overlay). Mientras está abierto, el input del chat principal queda bloqueado
 * (`subagentSessions.isViewOpen()`). Solo hay uno abierto a la vez.
 */

import { showModal, closeModal } from '@services/modals'
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

export interface OpenSubagentInput {
  sessionId: string
  title?: string
  texts?: SpawnTexts
}

export interface SpawnSubagentResult {
  sessionId: string
  modalId: string
}

/** Panel abierto actualmente (para no apilar varios). */
let currentModalId: string | null = null

/** Abre el chat de una sesión de subagente YA existente. */
export function openSubagentChat(input: OpenSubagentInput): string {
  if (currentModalId) {
    closeModal(currentModalId)
    currentModalId = null
  }
  subagentSessions.setViewOpen(true)
  const handle = showModal({
    title: input.title ?? 'Subagente',
    variant: 'plain',
    portalSelector: '[data-modal-portal="chat"]',
    render: ({ close }) => (
      <SubagentChatView sessionId={input.sessionId} texts={input.texts} onClose={close} />
    ),
    onClose: () => {
      if (currentModalId === handle.id) currentModalId = null
      subagentSessions.setViewOpen(false)
    }
  })
  currentModalId = handle.id
  return handle.id
}

/** Crea la sesión y abre su chat. */
export function spawnSubagentChat(input: SpawnSubagentInput): SpawnSubagentResult | null {
  const agent = agentRegistry.getSubagent(input.agentId)
  if (!agent) return null

  const sessionId = startSubagentSession(agent, input.prompt, { sessionId: input.sessionId })
  const modalId = openSubagentChat({
    sessionId,
    title: input.texts?.title ?? agent.label,
    texts: input.texts
  })
  return { sessionId, modalId }
}
