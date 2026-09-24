// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'fileIcons' — lógica (delega 100% en services/fileIcons).
 *
 * El tipo SEF es solo el INTERCEPTOR: convierte contribuciones del manifest
 * en llamadas al registry global. El Explorer/Tabs jamás importan este
 * archivo — solo consumen services/fileIcons.
 */

import {
  registerFileIconTheme,
  unregisterFileIconTheme,
  reactivateStoredFileIconTheme
} from '@services/fileIcons'
import type { FileIconTheme } from '@services/fileIcons'

export interface RegisteredFileIconRef {
  id: string
}

export function registerFileIconThemeEntry(args: {
  id: string
  name: string
  extensionId: string
  isBuiltin: boolean
  theme: FileIconTheme
}): void {
  registerFileIconTheme({
    id: args.id,
    name: args.name,
    extensionId: args.extensionId,
    isBuiltin: args.isBuiltin,
    theme: args.theme
  })
  reactivateStoredFileIconTheme(args.id)
}

export function unregisterFileIconThemeEntry(id: string): void {
  unregisterFileIconTheme(id)
}
