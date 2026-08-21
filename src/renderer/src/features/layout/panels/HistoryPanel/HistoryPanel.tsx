import { PlusIcon, SearchIcon } from '@proicons/react'
import { useMemo, useState, type JSX } from 'react'
import { ProvidersMenu, useProviders } from '@features/providers'
import { useChats } from '@features/chat'
import styles from './HistoryPanel.module.css'

/**
 * Panel de historial — sesiones REALES del ChatsProvider (nada hardcodeado):
 * Nuevo chat → búsqueda → sesiones recientes.
 * El redimensionado ya NO vive acá: lo maneja el sistema de layouts
 * (ResizeHandle + PanelFrame), este panel solo aporta su contenido.
 */
export function HistoryPanel(): JSX.Element {
  const { sessions, activeSessionId, createSession, selectSession } = useChats()
  const { openProvidersModal } = useProviders()
  const [query, setQuery] = useState('')

  const filteredSessions = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((session) => session.title.toLowerCase().includes(q))
  }, [sessions, query])

  const handleNewChat = (): void => {
    createSession()
    setQuery('')
  }

  return (
    <div className={styles.history}>
      <button type="button" className={styles.newChat} onClick={handleNewChat}>
        <PlusIcon size={15} />
        Nuevo chat
      </button>

      <div className={styles.search}>
        <SearchIcon size={14} className={styles.searchIcon} aria-hidden="true" />
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
            const classes = [styles.item, isActive ? styles.itemActive : null]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={session.id}
                type="button"
                className={classes}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => selectSession(session.id)}
              >
                <span className={styles.itemTitle}>{session.title}</span>
              </button>
            )
          })
        )}
      </nav>

      <ProvidersMenu onOpenProviders={openProvidersModal} />
    </div>
  )
}