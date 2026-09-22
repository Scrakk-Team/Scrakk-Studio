/**
 * SubagentChatView — el SUBAGENTE en un modal (dentro del panel de chat).
 *
 * No es un chat completo: muestra el transcript del subagente (contenido,
 * razonamiento, tool calls y resultados) en vivo, con su título y estado. No
 * tiene input: un subagente no recibe mensajes.
 */

import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { subagentSessions } from '@services/ai/agents'
import { MessageList } from '../components/MessageList/MessageList'
import type { SpawnTexts } from './types'
import styles from './SubagentChatView.module.css'

interface SubagentChatViewProps {
  sessionId: string
  texts?: SpawnTexts
  onClose: () => void
}

export function SubagentChatView({ sessionId, texts, onClose }: SubagentChatViewProps): JSX.Element {
  const [version, setVersion] = useState(0)
  useEffect(() => subagentSessions.subscribe(() => setVersion((v) => v + 1)), [])
  void version

  const session = subagentSessions.get(sessionId)
  const status = session?.status ?? 'running'
  const statusText =
    status === 'running'
      ? (texts?.working ?? 'Trabajando…')
      : status === 'done'
        ? (texts?.done ?? 'Listo')
        : (texts?.error ?? 'Error')

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <ProductIcon id="people" size={14} className={styles.icon} />
        <div className={styles.headText}>
          <span className={styles.title}>{texts?.title ?? session?.agentLabel ?? 'Subagente'}</span>
          <span className={styles.status} data-status={status}>
            {statusText}
          </span>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar subagente">
          <ProductIcon id="close" size={14} />
        </button>
      </header>

      <div className={styles.body}>
        {session ? (
          <MessageList messages={session.messages} isStreaming={status === 'running'} />
        ) : null}
      </div>
    </div>
  )
}
