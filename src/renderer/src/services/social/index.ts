/**
 * Servicio social (renderer) — POR CUENTA.
 *
 * Habla SOLO por IPC con el proceso main. Cada llamada lleva el `accountId`,
 * así varios paneles pueden usar cuentas distintas. Los eventos de Realtime
 * vienen etiquetados con la cuenta.
 */

import type {
  AccountEvent,
  DirectMessage,
  Friend,
  FriendRequest,
  ImageUpload,
  IncomingMessageEvent,
  MessageDeleteEvent,
  MessageUpdateEvent,
  PresenceActivity,
  PresenceStatus,
  SocialResult,
  SocialUser,
  TypingEvent,
  UploadedImage,
  UserPresence
} from '@shared/social'

export const social = {
  watch: (accountId: string): Promise<SocialResult<null>> => window.api.social.watch(accountId),
  listFriends: (accountId: string): Promise<SocialResult<Friend[]>> =>
    window.api.social.listFriends(accountId),
  searchUsers: (accountId: string, query: string): Promise<SocialResult<SocialUser[]>> =>
    window.api.social.searchUsers(accountId, query),
  listRequests: (accountId: string): Promise<SocialResult<FriendRequest[]>> =>
    window.api.social.listRequests(accountId),
  sendRequest: (accountId: string, targetId: string): Promise<SocialResult<string>> =>
    window.api.social.sendRequest(accountId, targetId),
  respondRequest: (
    accountId: string,
    requestId: string,
    accept: boolean
  ): Promise<SocialResult<string>> => window.api.social.respondRequest(accountId, requestId, accept),
  removeFriend: (accountId: string, otherId: string): Promise<SocialResult<boolean>> =>
    window.api.social.removeFriend(accountId, otherId),
  listMessages: (
    accountId: string,
    withUserId: string,
    beforeId?: string | null,
    limit?: number
  ): Promise<SocialResult<DirectMessage[]>> =>
    window.api.social.listMessages(accountId, withUserId, beforeId ?? null, limit ?? 50),
  sendMessage: (
    accountId: string,
    toUserId: string,
    body: string,
    replyTo?: string | null,
    attachments?: ImageUpload[]
  ): Promise<SocialResult<DirectMessage>> =>
    window.api.social.sendMessage(accountId, toUserId, body, replyTo ?? null, attachments ?? []),
  uploadImage: (
    accountId: string,
    kind: 'chat' | 'avatar',
    image: ImageUpload
  ): Promise<SocialResult<UploadedImage>> => window.api.social.uploadImage(accountId, kind, image),
  editMessage: (
    accountId: string,
    messageId: string,
    body: string
  ): Promise<SocialResult<DirectMessage>> => window.api.social.editMessage(accountId, messageId, body),
  deleteMessage: (accountId: string, messageId: string): Promise<SocialResult<null>> =>
    window.api.social.deleteMessage(accountId, messageId),
  markRead: (accountId: string, withUserId: string): Promise<SocialResult<null>> =>
    window.api.social.markRead(accountId, withUserId),
  getPresence: (accountId: string): Promise<SocialResult<UserPresence[]>> =>
    window.api.social.getPresence(accountId),
  setPresence: (
    accountId: string,
    status: PresenceStatus,
    activity: PresenceActivity
  ): Promise<SocialResult<null>> => window.api.social.setPresence(accountId, status, activity),
  sendTyping: (accountId: string, peerId: string, typing: boolean): Promise<void> =>
    window.api.social.sendTyping(accountId, peerId, typing),
  onIncomingMessage: (callback: (event: IncomingMessageEvent) => void): (() => void) =>
    window.api.social.onIncomingMessage(callback),
  onMessageUpdated: (callback: (event: MessageUpdateEvent) => void): (() => void) =>
    window.api.social.onMessageUpdated(callback),
  onMessageDeleted: (callback: (event: MessageDeleteEvent) => void): (() => void) =>
    window.api.social.onMessageDeleted(callback),
  onRequestsChanged: (callback: (event: AccountEvent) => void): (() => void) =>
    window.api.social.onRequestsChanged(callback),
  onFriendsChanged: (callback: (event: AccountEvent) => void): (() => void) =>
    window.api.social.onFriendsChanged(callback),
  onPresenceChanged: (callback: (event: AccountEvent) => void): (() => void) =>
    window.api.social.onPresenceChanged(callback),
  onTypingChanged: (callback: (event: TypingEvent) => void): (() => void) =>
    window.api.social.onTypingChanged(callback)
}

export type {
  AccountEvent,
  DirectMessage,
  Friend,
  FriendRequest,
  IncomingMessageEvent,
  MessageDeleteEvent,
  MessageUpdateEvent,
  PresenceActivity,
  PresenceStatus,
  SocialResult,
  SocialUser,
  TypingEvent,
  UserPresence
}
