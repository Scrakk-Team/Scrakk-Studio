// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * IPC social (proceso main) — POR CUENTA.
 *
 * Cada handler recibe el `accountId`. Los eventos de Realtime se etiquetan con
 * la cuenta para que cada panel filtre los suyos.
 */

import { BrowserWindow, ipcMain } from 'electron'
import { SOCIAL_IPC, type ImageUpload, type PresenceActivity, type PresenceStatus } from '@shared/social'
import * as service from './service'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function registerSocialIpc(): void {
  ipcMain.handle(SOCIAL_IPC.watch, async (_event, accountId: string) => {
    await service.watchAccount(accountId, {
      incomingMessage: (message) =>
        broadcast(SOCIAL_IPC.incomingMessage, { accountId, message }),
      messageUpdated: (message) =>
        broadcast(SOCIAL_IPC.messageUpdated, { accountId, message }),
      messageDeleted: (payload) =>
        broadcast(SOCIAL_IPC.messageDeleted, { accountId, ...payload }),
      requestsChanged: () => broadcast(SOCIAL_IPC.requestsChanged, { accountId }),
      friendsChanged: () => broadcast(SOCIAL_IPC.friendsChanged, { accountId }),
      presenceChanged: () => broadcast(SOCIAL_IPC.presenceChanged, { accountId }),
      typingChanged: (payload) => broadcast(SOCIAL_IPC.typingChanged, { accountId, ...payload })
    })
    return { ok: true, data: null }
  })
  ipcMain.handle(SOCIAL_IPC.listFriends, (_event, accountId: string) =>
    service.listFriends(accountId)
  )
  ipcMain.handle(SOCIAL_IPC.searchUsers, (_event, accountId: string, query: string) =>
    service.searchUsers(accountId, query)
  )
  ipcMain.handle(SOCIAL_IPC.listRequests, (_event, accountId: string) =>
    service.listRequests(accountId)
  )
  ipcMain.handle(SOCIAL_IPC.sendRequest, (_event, accountId: string, targetId: string) =>
    service.sendRequest(accountId, targetId)
  )
  ipcMain.handle(
    SOCIAL_IPC.respondRequest,
    (_event, accountId: string, requestId: string, accept: boolean) =>
      service.respondRequest(accountId, requestId, accept)
  )
  ipcMain.handle(SOCIAL_IPC.removeFriend, (_event, accountId: string, otherId: string) =>
    service.removeFriend(accountId, otherId)
  )
  ipcMain.handle(
    SOCIAL_IPC.listMessages,
    (_event, accountId: string, withUserId: string, beforeId?: string | null, limit?: number) =>
      service.listMessages(accountId, withUserId, beforeId ?? null, limit ?? 50)
  )
  ipcMain.handle(
    SOCIAL_IPC.sendMessage,
    (_event, accountId: string, toUserId: string, body: string, replyTo?: string | null, attachments?: ImageUpload[]) =>
      service.sendMessage(accountId, toUserId, body, replyTo ?? null, attachments ?? [])
  )
  ipcMain.handle(
    SOCIAL_IPC.uploadImage,
    (_event, accountId: string, kind: 'chat' | 'avatar', image: ImageUpload) =>
      service.uploadImage(accountId, kind, image)
  )
  ipcMain.handle(
    SOCIAL_IPC.editMessage,
    (_event, accountId: string, messageId: string, body: string) =>
      service.editMessage(accountId, messageId, body)
  )
  ipcMain.handle(SOCIAL_IPC.deleteMessage, (_event, accountId: string, messageId: string) =>
    service.deleteMessage(accountId, messageId)
  )
  ipcMain.handle(SOCIAL_IPC.sendTyping, (_event, accountId: string, peerId: string, typing: boolean) =>
    service.sendTyping(accountId, peerId, typing)
  )
  ipcMain.handle(SOCIAL_IPC.markRead, (_event, accountId: string, withUserId: string) =>
    service.markRead(accountId, withUserId)
  )
  ipcMain.handle(SOCIAL_IPC.getPresence, (_event, accountId: string) =>
    service.getPresence(accountId)
  )
  ipcMain.handle(
    SOCIAL_IPC.setPresence,
    (_event, accountId: string, status: PresenceStatus, activity: PresenceActivity) =>
      service.setPresence(accountId, status, activity)
  )
}
