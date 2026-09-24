// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Difusión de eventos main → renderer a todas las ventanas vivas.
 *
 * Mismo patrón que `main/lsp` (y `main/windows/main-window`): los eventos push
 * van a todas las ventanas, que filtran por su lado.
 */

import { BrowserWindow } from 'electron'

export function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}
