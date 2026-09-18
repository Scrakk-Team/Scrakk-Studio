/**
 * IPC de cuenta (proceso main) — MULTI-CUENTA.
 *
 * Cada panel del layout maneja su propio `accountId`; el main mantiene un
 * cliente Supabase por cuenta. El renderer solo recibe perfiles, nunca tokens.
 */

import { ipcMain } from 'electron'
import {
  ACCOUNT_IPC,
  type RequestCodeRequest,
  type UpdateProfileRequest,
  type VerifyCodeRequest
} from '@shared/account'
import { dropClient } from '../supabaseClient'
import { stopWatching } from '../social/service'
import * as service from './service'

export function registerAccountIpc(): void {
  ipcMain.handle(ACCOUNT_IPC.requestCode, (_event, req: RequestCodeRequest) =>
    service.requestCode(req)
  )
  ipcMain.handle(ACCOUNT_IPC.verifyCode, (_event, req: VerifyCodeRequest) => service.verifyCode(req))
  ipcMain.handle(ACCOUNT_IPC.current, (_event, accountId: string) => service.current(accountId))
  ipcMain.handle(ACCOUNT_IPC.update, (_event, accountId: string, req: UpdateProfileRequest) =>
    service.update(accountId, req)
  )
  ipcMain.handle(ACCOUNT_IPC.listAccounts, () => service.listAccounts())
  ipcMain.handle(ACCOUNT_IPC.setDefault, (_event, accountId: string) => service.setDefault(accountId))
  ipcMain.handle(ACCOUNT_IPC.removeAccount, async (_event, accountId: string) => {
    // Baja limpia: realtime + cliente + store.
    stopWatching(accountId)
    dropClient(accountId)
    return service.removeAccount(accountId)
  })
}
