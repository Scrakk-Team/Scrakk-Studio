// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** IPC de la tienda de extensiones. */

import { ipcMain } from 'electron'
import {
  MARKET_IPC,
  type MarketImageUpload,
  type MarketRateRequest,
  type MarketReportRequest,
  type MarketSearchRequest,
  type MarketUpsertRequest,
  type RepoProvider
} from '@shared/market'
import * as service from '../market/service'

export function registerMarketIpc(): void {
  ipcMain.handle(MARKET_IPC.search, (_event, req: MarketSearchRequest) => service.search(req))
  ipcMain.handle(MARKET_IPC.categories, () => service.categories())
  ipcMain.handle(MARKET_IPC.get, (_event, slug: string) => service.get(slug))
  ipcMain.handle(MARKET_IPC.mine, (_event, accountId: string) => service.mine(accountId))
  ipcMain.handle(MARKET_IPC.upsert, (_event, accountId: string, req: MarketUpsertRequest) =>
    service.upsert(accountId, req)
  )
  ipcMain.handle(MARKET_IPC.remove, (_event, accountId: string, slug: string) =>
    service.remove(accountId, slug)
  )
  ipcMain.handle(MARKET_IPC.rate, (_event, accountId: string, req: MarketRateRequest) =>
    service.rate(accountId, req)
  )
  ipcMain.handle(MARKET_IPC.ratings, (_event, accountId: string | null, slug: string) =>
    service.ratings(accountId, slug)
  )
  ipcMain.handle(MARKET_IPC.report, (_event, accountId: string, req: MarketReportRequest) =>
    service.report(accountId, req)
  )
  ipcMain.handle(MARKET_IPC.uploadImage, (_event, accountId: string, image: MarketImageUpload) =>
    service.uploadImage(accountId, image)
  )
  ipcMain.handle(
    MARKET_IPC.resolveRelease,
    (
      _event,
      input: { repoProvider: RepoProvider; repoUrl: string; assetName?: string | null }
    ) => service.resolveRelease(input)
  )
  ipcMain.handle(MARKET_IPC.install, (_event, accountId: string | null, slug: string) =>
    service.install(accountId, slug)
  )
  ipcMain.handle(MARKET_IPC.refresh, (_event, accountId: string) => service.refresh(accountId))
}
