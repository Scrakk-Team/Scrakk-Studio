// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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
  PresenceEvent,
  PresenceStatus,
  SocialResult,
  SocialUser,
  TypingEvent,
  UploadedImage,
  UserPresence
} from '@shared/social'
import { api } from '@services/api'

export const social = {
  watch: (accountId: string): Promise<SocialResult<null>> => api.social.watch(accountId),
  listFriends: (accountId: string): Promise<SocialResult<Friend[]>> =>
    api.social.listFriends(accountId),
  searchUsers: (accountId: string, query: string): Promise<SocialResult<SocialUser[]>> =>
    api.social.searchUsers(accountId, query),
  listRequests: (accountId: string): Promise<SocialResult<FriendRequest[]>> =>
    api.social.listRequests(accountId),
  sendRequest: (accountId: string, targetId: string): Promise<SocialResult<string>> =>
    api.social.sendRequest(accountId, targetId),
  respondRequest: (
    accountId: string,
    requestId: string,
    accept: boolean
  ): Promise<SocialResult<string>> => api.social.respondRequest(accountId, requestId, accept),
  removeFriend: (accountId: string, otherId: string): Promise<SocialResult<boolean>> =>
    api.social.removeFriend(accountId, otherId),
  listMessages: (
    accountId: string,
    withUserId: string,
    beforeId?: string | null,
    limit?: number
  ): Promise<SocialResult<DirectMessage[]>> =>
    api.social.listMessages(accountId, withUserId, beforeId ?? null, limit ?? 50),
  sendMessage: (
    accountId: string,
    toUserId: string,
    body: string,
    replyTo?: string | null,
    attachments?: ImageUpload[]
  ): Promise<SocialResult<DirectMessage>> =>
    api.social.sendMessage(accountId, toUserId, body, replyTo ?? null, attachments ?? []),
  uploadImage: (
    accountId: string,
    kind: 'chat' | 'avatar',
    image: ImageUpload
  ): Promise<SocialResult<UploadedImage>> => api.social.uploadImage(accountId, kind, image),
  editMessage: (
    accountId: string,
    messageId: string,
    body: string
  ): Promise<SocialResult<DirectMessage>> => api.social.editMessage(accountId, messageId, body),
  deleteMessage: (accountId: string, messageId: string): Promise<SocialResult<null>> =>
    api.social.deleteMessage(accountId, messageId),
  markRead: (accountId: string, withUserId: string): Promise<SocialResult<null>> =>
    api.social.markRead(accountId, withUserId),
  getPresence: (accountId: string): Promise<SocialResult<UserPresence[]>> =>
    api.social.getPresence(accountId),
  setPresence: (
    accountId: string,
    status: PresenceStatus,
    activity: PresenceActivity
  ): Promise<SocialResult<null>> => api.social.setPresence(accountId, status, activity),
  sendTyping: (accountId: string, peerId: string, typing: boolean): Promise<void> =>
    api.social.sendTyping(accountId, peerId, typing),
  onIncomingMessage: (callback: (event: IncomingMessageEvent) => void): (() => void) =>
    api.social.onIncomingMessage(callback),
  onMessageUpdated: (callback: (event: MessageUpdateEvent) => void): (() => void) =>
    api.social.onMessageUpdated(callback),
  onMessageDeleted: (callback: (event: MessageDeleteEvent) => void): (() => void) =>
    api.social.onMessageDeleted(callback),
  onRequestsChanged: (callback: (event: AccountEvent) => void): (() => void) =>
    api.social.onRequestsChanged(callback),
  onFriendsChanged: (callback: (event: AccountEvent) => void): (() => void) =>
    api.social.onFriendsChanged(callback),
  onPresenceChanged: (callback: (event: PresenceEvent) => void): (() => void) =>
    api.social.onPresenceChanged(callback),
  onTypingChanged: (callback: (event: TypingEvent) => void): (() => void) =>
    api.social.onTypingChanged(callback)
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
  PresenceEvent,
  PresenceStatus,
  SocialResult,
  SocialUser,
  TypingEvent,
  UserPresence
}
