// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Servicio de cuenta (renderer) — MULTI-CUENTA.
 *
 * Todo pasa por IPC al proceso main. Cada llamada lleva el `accountId` (el
 * `auth.users.id` de esa cuenta), así cada panel maneja la suya. Aquí no hay
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
import { api } from '@services/api'

export const account = {
  requestCode(req: RequestCodeRequest): Promise<AccountResult<null>> {
    return api.account.requestCode(req)
  },
  verifyCode(req: VerifyCodeRequest): Promise<AccountResult<AccountProfile>> {
    return api.account.verifyCode(req)
  },
  current(accountId: string): Promise<AccountResult<AccountProfile | null>> {
    return api.account.current(accountId)
  },
  update(accountId: string, req: UpdateProfileRequest): Promise<AccountResult<AccountProfile>> {
    return api.account.update(accountId, req)
  },
  listAccounts(): Promise<AccountResult<AccountList>> {
    return api.account.listAccounts()
  },
  setDefault(accountId: string): Promise<AccountResult<AccountList>> {
    return api.account.setDefault(accountId)
  },
  removeAccount(accountId: string): Promise<AccountResult<AccountList>> {
    return api.account.removeAccount(accountId)
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
