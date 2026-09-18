/**
 * Servicio de cuenta (renderer) — MULTI-CUENTA.
 *
 * Todo pasa por IPC al proceso main. Cada llamada lleva el `accountId` (el
 * `auth.users.id` de esa cuenta), así cada panel maneja la suya. Acá no hay
 * tokens ni claves.
 */

import type {
  AccountList,
  AccountProfile,
  AccountResult,
  RequestCodeRequest,
  UpdateProfileRequest,
  VerifyCodeRequest
} from '@shared/account'

export const account = {
  requestCode(req: RequestCodeRequest): Promise<AccountResult<null>> {
    return window.api.account.requestCode(req)
  },
  verifyCode(req: VerifyCodeRequest): Promise<AccountResult<AccountProfile>> {
    return window.api.account.verifyCode(req)
  },
  current(accountId: string): Promise<AccountResult<AccountProfile | null>> {
    return window.api.account.current(accountId)
  },
  update(accountId: string, req: UpdateProfileRequest): Promise<AccountResult<AccountProfile>> {
    return window.api.account.update(accountId, req)
  },
  listAccounts(): Promise<AccountResult<AccountList>> {
    return window.api.account.listAccounts()
  },
  setDefault(accountId: string): Promise<AccountResult<AccountList>> {
    return window.api.account.setDefault(accountId)
  },
  removeAccount(accountId: string): Promise<AccountResult<AccountList>> {
    return window.api.account.removeAccount(accountId)
  }
}

export type {
  AccountList,
  AccountProfile,
  AccountResult,
  RequestCodeRequest,
  UpdateProfileRequest,
  VerifyCodeRequest
}
