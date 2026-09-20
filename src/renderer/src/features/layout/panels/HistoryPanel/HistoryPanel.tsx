import { ProductIcon } from '@services/productIcons/components'
import { startTransition, useMemo, useState, type JSX, type MouseEvent } from 'react'
import { ProvidersMenu, useProviders } from '@features/providers'
import { useChats } from '@features/chat'
import { showModal } from '@services/modals'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import { ExportChatDialog } from '@features/chat/components/ChatExport/ExportChatDialog'
import styles from './HistoryPanel.module.css'

/**
 * Historial de chats — sesiones REALES del ChatsProvider (nada hardcodeado):
 * Nuevo chat → búsqueda → sesiones recientes.
 *
 * Ya NO es un panel suelto: es la vista que el ChatPanel monta adentro suyo
 * cuando se toca el botón de historial de su header (ver `viewState.ts`).
 * `onPick` es el aviso de "el usuario eligió una conversación" — el chat lo
 * usa para cerrar la vista y volver a mostrar el chat elegido.
 */
export function HistoryPanel({ onPick }: { onPick?: () => void } = {}): JSX.Element {
  const { sessions, activeSessionId, createSession, selectSession, deleteSession } = useChats()
  const { openProvidersModal } = useProviders()
  const [query, setQuery] = useState('')

  const filteredSessions = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((session) => session.title.toLowerCase().includes(q))
  }, [sessions, query])

  const handleNewChat = (): void => {
    startTransition(() => {
      createSession()
    })
    setQuery('')
    onPick?.()
  }

  const openSessionMenu = (event: MouseEvent<HTMLButtonElement>, sessionId: string): void => {
    event.stopPropagation()
    const session = sessions.find((candidate) => candidate.id === sessionId)
    if (!session) return
    showContextMenu(event.clientX, event.clientY, [
      {
        label: 'Exportar chat',
        icon: <ProductIcon id="download" size={13} />,
        onClick: () => {
          showModal({
            title: `Exportar "${session.title}"`,
            render: ({ close }) => <ExportChatDialog session={session} onDone={close} />
          })
        }
      },
      {
        label: 'Eliminar',
        icon: <ProductIcon id="trash" size={13} />,
        danger: true,
        separatorBefore: true,
        onClick: () => deleteSession(sessionId)
      }
    ])
  }

  return (
    <div className={styles.history}>
      <button type="button" className={styles.newChat} onClick={handleNewChat}>
        <ProductIcon id="plus" size={15} />
        Nuevo chat
      </button>

      <div className={styles.search}>
        <ProductIcon id="search" size={14} className={styles.searchIcon} aria-hidden="true" />
        <input
          className={styles.searchInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar chats…"
          aria-label="Buscar chats"
        />
      </div>

      <nav className={styles.list} aria-label="Historial de chats">
        {filteredSessions.length === 0 ? (
          <p className={styles.empty}>
            {sessions.length === 0 ? 'Sin chats todavía' : 'Sin resultados'}
          </p>
        ) : (
          filteredSessions.map((session) => {
            const isActive = session.id === activeSessionId
            const classes = [styles.itemRow, isActive ? styles.itemActive : null]
              .filter(Boolean)
              .join(' ')
            return (
              <div key={session.id} className={classes}>
                <button
                  type="button"
                  className={styles.item}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => {
                    // Cambiar de chat monta todo el historial de la sesión:
                    // transición, así el click responde al instante.
                    startTransition(() => selectSession(session.id))
                    onPick?.()
                  }}
                >
                  <span className={styles.itemTitle}>{session.title}</span>
                </button>
                <button
                  type="button"
                  className={styles.itemMenu}
                  title="Más acciones"
                  aria-label={`Más acciones para ${session.title}`}
                  onClick={(event) => openSessionMenu(event, session.id)}
                >
                  <ProductIcon id="more" size={14} />
                </button>
              </div>
            )
          })
        )}
      </nav>

      <ProvidersMenu onOpenProviders={openProvidersModal} />
    </div>
  )
}