import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { ChatMessage } from '@services/chat'
import {
  getPersistedChatSessions,
  persistChatSessions,
  getPersistedChatActiveSession,
  persistChatActiveSession
} from '@services/storage'

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

interface ChatsContextValue {
  sessions: ChatSession[]
  activeSessionId: string | null
  activeSession: ChatSession | null
  /** Crea una sesión nueva, la deja activa y devuelve su id. */
  createSession: () => string
  selectSession: (id: string) => void
  appendMessage: (sessionId: string, message: ChatMessage) => void
  /** Actualiza un mensaje existente (usado por el stream para acumular). */
  updateMessage: (
    sessionId: string,
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage
  ) => void
  /** Elimina los mensajes desde un índice (exclusivo) hasta el final. */
  removeMessagesAfter: (sessionId: string, keepCount: number) => void
  /** Elimina la sesión entera; si era la activa, activa la más reciente. */
  deleteSession: (sessionId: string) => void
}

const ChatsContext = createContext<ChatsContextValue | null>(null)

/**
 * Estado real de las conversaciones (no hardcodeado): las sesiones nacen
 * de las acciones del usuario y el historial del panel derecho las refleja.
 *
 * Persistencia: se hidrata desde localStorage al montar y se escribe con
 * debounce en cada mutación (el stream actualiza a cada chunk, no escribimos
 * a cada delta). Un flush en `beforeunload` garantiza que al cerrar la
 * ventana se guarde el estado más reciente.
 */
export function ChatsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => getPersistedChatSessions())
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() =>
    getPersistedChatActiveSession()
  )

  // Refs espejo para el flush de beforeunload (lee el valor actual sin
  // re-suscribir el listener en cada render).
  const sessionsRef = useRef(sessions)
  const activeSessionIdRef = useRef(activeSessionId)
  sessionsRef.current = sessions
  activeSessionIdRef.current = activeSessionId

  // Persistencia con debounce: agrupa los cambios del stream.
  useEffect(() => {
    const timer = setTimeout(() => persistChatSessions(sessions), 300)
    return () => clearTimeout(timer)
  }, [sessions])

  useEffect(() => {
    const timer = setTimeout(() => persistChatActiveSession(activeSessionId), 300)
    return () => clearTimeout(timer)
  }, [activeSessionId])

  // Flush inmediato al cerrar la ventana: no confiar solo en el debounce.
  useEffect(() => {
    const flush = (): void => {
      persistChatSessions(sessionsRef.current)
      persistChatActiveSession(activeSessionIdRef.current)
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  const createSession = useCallback((): string => {
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title: 'Nuevo chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    setSessions((prev) => [session, ...prev])
    setActiveSessionId(session.id)
    return session.id
  }, [])

  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id)
  }, [])

  const appendMessage = useCallback((sessionId: string, message: ChatMessage) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: [...session.messages, message],
              updatedAt: message.timestamp,
              // El primer mensaje del usuario nombra la sesión (como ChatGPT).
              title:
                session.title === 'Nuevo chat' && message.role === 'user'
                  ? message.content.slice(0, 48)
                  : session.title
            }
          : session
      )
    )
  }, [])

  const updateMessage = useCallback(
    (sessionId: string, messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                messages: session.messages.map((message) =>
                  message.id === messageId ? updater(message) : message
                ),
                updatedAt: Date.now()
              }
            : session
        )
      )
    },
    []
  )

  const removeMessagesAfter = useCallback((sessionId: string, keepCount: number) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: session.messages.slice(0, keepCount),
              updatedAt: Date.now()
            }
          : session
      )
    )
  }, [])

  const deleteSession = useCallback((sessionId: string): void => {
    const remaining = sessionsRef.current
      .filter((session) => session.id !== sessionId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    setSessions((prev) => prev.filter((session) => session.id !== sessionId))
    if (activeSessionIdRef.current === sessionId) {
      setActiveSessionId(remaining[0]?.id ?? null)
    }
  }, [])

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  )

  const value = useMemo(
    () => ({
      sessions,
      activeSessionId,
      activeSession,
      createSession,
      selectSession,
      appendMessage,
      updateMessage,
      removeMessagesAfter,
      deleteSession
    }),
    [
      sessions,
      activeSessionId,
      activeSession,
      createSession,
      selectSession,
      appendMessage,
      updateMessage,
      removeMessagesAfter,
      deleteSession
    ]
  )

  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>
}

export function useChats(): ChatsContextValue {
  const context = useContext(ChatsContext)
  if (!context) {
    throw new Error('useChats debe usarse dentro de <ChatsProvider>')
  }
  return context
}
