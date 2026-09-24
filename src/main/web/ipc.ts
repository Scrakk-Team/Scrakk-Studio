// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * IPC de la API web (search + fetch).
 */

import { ipcMain } from 'electron'
import { WEB_IPC, type WebFetchRequest, type WebFetchResponse, type WebSearchRequest, type WebSearchResponse } from '@shared/web'
import { searchWeb } from './search'
import { fetchUrl } from './fetch'

export function registerWebIpc(): void {
  ipcMain.handle(WEB_IPC.search, async (_event, request: WebSearchRequest): Promise<WebSearchResponse> => {
    try {
      const query = String(request?.query ?? '')
      const results = await searchWeb({ query, allowedDomains: request?.allowedDomains })
      return { ok: true, query, results }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(WEB_IPC.fetch, async (_event, request: WebFetchRequest): Promise<WebFetchResponse> => {
    const url = String(request?.url ?? '')
    if (!url) return { ok: false, error: 'Falta la URL' }
    return fetchUrl(url)
  })
}
