/**
 * IPC del catálogo de modelos (models.dev).
 */

import { ipcMain } from 'electron'
import { MODELS_DEV_IPC } from '@shared/modelsDev'
import { getCatalog, refreshCatalog } from './catalog'

export function registerModelsDevIpc(): void {
  ipcMain.handle(MODELS_DEV_IPC.catalog, () => getCatalog())
  ipcMain.handle(MODELS_DEV_IPC.refresh, () => refreshCatalog())
}
