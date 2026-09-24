// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * IPC de la API global de `.scrakk`.
 *
 * El renderer (y por ende cualquier subsistema: LSP, skills, tools, paneles)
 * habla con la carpeta `.scrakk` por acá. Los watchers son POR SENDER y se
 * limpian solos cuando la ventana se destruye.
 */

import { ipcMain } from 'electron'
import { SCRAKK_FS_IPC, type ScrakkOp } from '@shared/scrakk'
import {
  disposeWatchersFor,
  entryExists,
  listEntries,
  makeDir,
  readJson,
  readText,
  removeEntry,
  rootsOf,
  statEntry,
  unwatchDir,
  watchDir,
  writeJson,
  writeText
} from './fs'

const watchedSenders = new Set<number>()

export function registerScrakkIpc(): void {
  ipcMain.handle(SCRAKK_FS_IPC.roots, (_event, projectRoot?: string | null) =>
    rootsOf(projectRoot ?? null)
  )

  ipcMain.handle(SCRAKK_FS_IPC.list, (_event, op: ScrakkOp) => listEntries(op))
  ipcMain.handle(SCRAKK_FS_IPC.read, (_event, op: ScrakkOp) => readText(op))
  ipcMain.handle(SCRAKK_FS_IPC.write, (_event, op: ScrakkOp & { content: string }) => writeText(op))
  ipcMain.handle(SCRAKK_FS_IPC.delete, (_event, op: ScrakkOp) => removeEntry(op))
  ipcMain.handle(SCRAKK_FS_IPC.mkdir, (_event, op: ScrakkOp) => makeDir(op))
  ipcMain.handle(SCRAKK_FS_IPC.exists, (_event, op: ScrakkOp) => entryExists(op))
  ipcMain.handle(SCRAKK_FS_IPC.stat, (_event, op: ScrakkOp) => statEntry(op))
  ipcMain.handle(SCRAKK_FS_IPC.readJson, (_event, op: ScrakkOp) => readJson(op))
  ipcMain.handle(SCRAKK_FS_IPC.writeJson, (_event, op: ScrakkOp & { data: Record<string, unknown> }) =>
    writeJson(op)
  )

  ipcMain.handle(SCRAKK_FS_IPC.watch, (event, op: ScrakkOp) => {
    const sender = event.sender
    if (!watchedSenders.has(sender.id)) {
      watchedSenders.add(sender.id)
      sender.once('destroyed', () => {
        disposeWatchersFor(sender.id)
        watchedSenders.delete(sender.id)
      })
    }
    return watchDir(sender, op, (target, change) => {
      if (!target.isDestroyed()) target.send(SCRAKK_FS_IPC.changed, change)
    })
  })

  ipcMain.handle(SCRAKK_FS_IPC.unwatch, (event, op: ScrakkOp) => unwatchDir(event.sender, op))
}
