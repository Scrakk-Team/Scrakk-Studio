/**
 * Social (IDE) — contrato compartido main ⇄ preload ⇄ renderer.
 *
 * Amigos + mensajes directos 1:1 con Supabase Realtime, MULTI-CUENTA: cada
 * llamada lleva el `accountId` (el `auth.users.id` de esa cuenta), así varios
 * paneles del layout pueden usar cuentas distintas al mismo tiempo.
 */

export const SOCIAL_IPC = {
  /** Abre (una vez) el canal de Realtime de una cuenta. */
  watch: 'social:watch',
  listFriends: 'social:list-friends',
  searchUsers: 'social:search-users',
  listRequests: 'social:list-requests',
  sendRequest: 'social:send-request',
  respondRequest: 'social:respond-request',
  removeFriend: 'social:remove-friend',
  listMessages: 'social:list-messages',
  sendMessage: 'social:send-message',
  editMessage: 'social:edit-message',
  deleteMessage: 'social:delete-message',
  markRead: 'social:mark-read',
  /** Presencia: leer (yo + amigos) y publicar la mía. */
  getPresence: 'social:get-presence',
  setPresence: 'social:set-presence',
  /** Typing indicator (broadcast, no DB) */
  sendTyping: 'social:send-typing',
  /** Evento main → renderer: llegó un mensaje nuevo. */
  incomingMessage: 'social:incoming-message',
  /** Evento main → renderer: mensaje editado/borrado */
  messageUpdated: 'social:message-updated',
  messageDeleted: 'social:message-deleted',
  /** Evento main → renderer: cambió el estado de solicitudes. */
  requestsChanged: 'social:requests-changed',
  /** Evento main → renderer: cambió la lista de amigos. */
  friendsChanged: 'social:friends-changed',
  /** Evento main → renderer: cambió la presencia (mía o de amigos). */
  presenceChanged: 'social:presence-changed',
  typingChanged: 'social:typing-changed'
} as const

/** Usuario público (mínimo) para listas y búsqueda. */
export interface SocialUser {
  id: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  bio?: string | null
  gender?: string | null
  customStatus?: string | null
  customStatusExpiresAt?: string | null
  createdAt?: string | null
}

/** Amigo con la fecha de amistad. */
export interface Friend extends SocialUser {
  since: string
}

export type RequestDirection = 'incoming' | 'outgoing'

/** Solicitud de amistad (pending) con el perfil del otro. */
export interface FriendRequest {
  id: string
  direction: RequestDirection
  otherId: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  createdAt: string
}

/** Mensaje directo 1:1. */
export interface DirectMessage {
  id: string
  senderId: string
  recipientId: string
  body: string
  createdAt: string
  readAt: string | null
  replyTo: string | null
  editedAt: string | null
  /** Preview del mensaje citado, si aplica (hidratado en list) */
  replyPreview?: { id: string; body: string; senderId: string } | null
}

/** Estado de presencia. */
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline'

/** Actividad compartida OPCIONAL (nunca rutas: solo nombres). */
export interface PresenceActivity {
  project?: string
  file?: string
}

/** Presencia de un usuario (propia o de un amigo). */
export interface UserPresence {
  userId: string
  status: PresenceStatus
  activity: PresenceActivity
  updatedAt: string
}

/** Resultado uniforme (nunca se lanza a través del IPC). */
export type SocialResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Carga útil de los eventos de Realtime (a qué cuenta pertenecen). */
export interface IncomingMessageEvent {
  accountId: string
  message: DirectMessage
}
export interface MessageUpdateEvent {
  accountId: string
  message: DirectMessage
}
export interface MessageDeleteEvent {
  accountId: string
  messageId: string
  peerId: string
}
export interface AccountEvent {
  accountId: string
}
export interface TypingEvent {
  accountId: string
  peerId: string
  userId: string
  typing: boolean
}

/** API expuesta en `window.api.social`. */
export interface SocialApi {
  /** Abre el canal Realtime de esa cuenta (idempotente). */
  watch: (accountId: string) => Promise<SocialResult<null>>
  listFriends: (accountId: string) => Promise<SocialResult<Friend[]>>
  searchUsers: (accountId: string, query: string) => Promise<SocialResult<SocialUser[]>>
  listRequests: (accountId: string) => Promise<SocialResult<FriendRequest[]>>
  /** Envía solicitud; devuelve 'pending' | 'accepted' | 'already_friends'. */
  sendRequest: (accountId: string, targetId: string) => Promise<SocialResult<string>>
  /** Responde una solicitud; devuelve 'accepted' | 'rejected'. */
  respondRequest: (
    accountId: string,
    requestId: string,
    accept: boolean
  ) => Promise<SocialResult<string>>
  removeFriend: (accountId: string, otherId: string) => Promise<SocialResult<boolean>>
  /** Últimos mensajes con un usuario (ambas direcciones), orden cronológico. Soporta paginación con beforeId. */
  listMessages: (
    accountId: string,
    withUserId: string,
    beforeId?: string | null,
    limit?: number
  ) => Promise<SocialResult<DirectMessage[]>>
  sendMessage: (
    accountId: string,
    toUserId: string,
    body: string,
    replyTo?: string | null
  ) => Promise<SocialResult<DirectMessage>>
  editMessage: (
    accountId: string,
    messageId: string,
    body: string
  ) => Promise<SocialResult<DirectMessage>>
  deleteMessage: (accountId: string, messageId: string) => Promise<SocialResult<null>>
  /** Marca como leídos los mensajes recibidos de ese usuario. */
  markRead: (accountId: string, withUserId: string) => Promise<SocialResult<null>>

  /** Presencia de la cuenta + sus amigos. */
  getPresence: (accountId: string) => Promise<SocialResult<UserPresence[]>>
  /** Publica mi estado/actividad. */
  setPresence: (
    accountId: string,
    status: PresenceStatus,
    activity: PresenceActivity
  ) => Promise<SocialResult<null>>

  sendTyping: (accountId: string, peerId: string, typing: boolean) => Promise<void>

  onIncomingMessage: (callback: (event: IncomingMessageEvent) => void) => () => void
  onMessageUpdated: (callback: (event: MessageUpdateEvent) => void) => () => void
  onMessageDeleted: (callback: (event: MessageDeleteEvent) => void) => () => void
  onRequestsChanged: (callback: (event: AccountEvent) => void) => () => void
  onFriendsChanged: (callback: (event: AccountEvent) => void) => () => void
  onPresenceChanged: (callback: (event: AccountEvent) => void) => () => void
  onTypingChanged: (callback: (event: TypingEvent) => void) => () => void
}

/** Reglas compartidas (main revalida). */
export const SOCIAL_RULES = {
  searchMin: 2,
  messageMax: 4000
} as const
