// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Social (IDE) — contrato compartido main ⇄ preload ⇄ renderer.
 *
 * Amigos + mensajes directos 1:1 con Supabase Realtime, MULTI-CUENTA: cada
 * llamada lleva el `accountId` (el `auth.users.id` de esa cuenta), así varios
 * paneles del layout pueden usar cuentas distintas al mismo tiempo.
 */

import type { SocialCodeFile } from './socialCodeFile'

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
  /** Sube una imagen al Storage (chat o avatar). */
  uploadImage: 'social:upload-image',
  /** Comparte un archivo: el contenido va a R2 vía Edge Function. */
  sendCodeFile: 'social:send-code-file',
  /** Baja el contenido de un archivo compartido (URL firmada). */
  codeFileContent: 'social:code-file-content',
  /** Borra el archivo (R2) y su mensaje — libera cupo. */
  deleteCodeFile: 'social:delete-code-file',
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
  /** Cuenta verificada (check al lado del nombre). */
  verified: boolean
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
  /** Cuenta verificada (check al lado del nombre). */
  verified: boolean
  createdAt: string
}

/** Tipo de mensaje: texto normal o archivo compartido (sobre en el body). */
export type SocialMessageKind = 'normal' | 'codefile'

/** Mensaje directo 1:1. */
export interface DirectMessage {
  id: string
  senderId: string
  recipientId: string
  /** `normal` = texto plano; `codefile` = sobre JSON con los metadatos. */
  kind: SocialMessageKind
  body: string
  createdAt: string
  readAt: string | null
  replyTo: string | null
  editedAt: string | null
  /** Preview del mensaje citado, si aplica (hidratado en list) */
  replyPreview?: { id: string; body: string; senderId: string } | null
  /** Imágenes pegadas (Ctrl+V) — hidratadas en list. */
  attachments?: MessageAttachment[]
}

/** Imagen adjunta a un DM (Storage: `chat-images`). */
export interface MessageAttachment {
  id: string
  messageId: string
  path: string
  url: string
  mime: string
  sizeBytes: number
  width: number | null
  height: number | null
}

/** Imagen lista para subir (binario en base64, sin prefijo data:). */
export interface ImageUpload {
  base64: string
  mime: string
  name: string
  width?: number | null
  height?: number | null
}

/** Resultado de subir una imagen al Storage. */
export interface UploadedImage {
  path: string
  url: string
  mime: string
  sizeBytes: number
}

/** Reglas de imágenes (main revalida). Formatos: png/jpg/webp/gif/avif. */
export const IMAGE_RULES = {
  maxBytes: 10 * 1024 * 1024,
  allowedMime: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
} as const

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
/**
 * Evento de presencia con la fila ya resuelta.
 *
 * Antes era un `AccountEvent` pelado y el renderer respondía refetcheando
 * amigos + solicitudes + presencia (3 queries y un re-render del panel por
 * cada latido de cada amigo). Ahora trae el `UserPresence` para actualizar
 * una sola entrada.
 */
export interface PresenceEvent extends AccountEvent {
  presence: UserPresence
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
    replyTo?: string | null,
    attachments?: ImageUpload[]
  ) => Promise<SocialResult<DirectMessage>>
  /** Sube imagen a Storage (`chat` o `avatar`). Devuelve URL pública. */
  uploadImage: (
    accountId: string,
    kind: 'chat' | 'avatar',
    image: ImageUpload
  ) => Promise<SocialResult<UploadedImage>>
  /** Comparte un archivo: el contenido va a R2, el mensaje lleva el sobre. */
  sendCodeFile: (
    accountId: string,
    toUserId: string,
    file: { name: string; lang: string; content: string },
    replyTo?: string | null
  ) => Promise<SocialResult<DirectMessage>>
  /** Baja el contenido de un archivo compartido (verifica integridad). */
  codeFileContent: (
    accountId: string,
    messageId: string
  ) => Promise<SocialResult<{ content: string; meta: SocialCodeFile }>>
  /** Borra el archivo en R2 y su mensaje (libera cupo). */
  deleteCodeFile: (accountId: string, messageId: string) => Promise<SocialResult<boolean>>
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
  onPresenceChanged: (callback: (event: PresenceEvent) => void) => () => void
  onTypingChanged: (callback: (event: TypingEvent) => void) => () => void
}

/** Reglas compartidas (main revalida). */
export const SOCIAL_RULES = {
  searchMin: 2,
  messageMax: 4000,
  /**
   * Slowmode de mensajes (como Discord): ventana deslizante. El cliente bloquea
   * al pasarse con un mensaje simpático; la DB tiene un backstop más holgado
   * (trigger `messages_rate_limit`, 7 en 5 s).
   */
  slowmode: { windowMs: 5000, max: 5 },
  /**
   * Archivos compartidos (`kind = 'codefile'`). El contenido va a R2; el body
   * solo lleva el sobre. Límites por archivo y cupo por conversación: borrar
   * un archivo (o los 60 días de lifecycle) libera cupo.
   */
  codeFileMaxLines: 10_000,
  codeFileMaxChars: 512 * 1024,
  codeFileTtlDays: 60,
  codeFileQuotaPerConversation: 15
} as const
