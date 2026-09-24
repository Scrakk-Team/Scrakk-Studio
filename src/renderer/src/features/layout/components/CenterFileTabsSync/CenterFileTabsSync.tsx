// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, type JSX } from 'react'
import { subscribeToEditorFiles } from '@features/editor/editorBus'
import { tabsStore } from '@features/tabs'
import { reconcileFileTabs, syncEditorFileOrderFromCenter } from '../../actions'

/**
 * Puente editorBus ↔ sistema de tabs.
 *
 * Mantiene la regla: CADA archivo abierto en editorBus tiene exactamente UNA
 * tab. Los archivos viven por defecto en el strip central; si el usuario los
 * movió a otro slot, su tab persiste ahí (no se duplica al centro). Cerrar
 * un archivo (explorer, menú, X de la tab) quita la tab de donde esté y
 * destruye su sesión multi-editor.
 */
export function CenterFileTabsSync(): JSX.Element | null {
  useEffect(() => {
    // Reconciliación inicial (restore: archivos persistidos de la sesión).
    reconcileFileTabs()
    const unsubBus = subscribeToEditorFiles(() => reconcileFileTabs())
    const unsubTabs = tabsStore.subscribe((event) => {
      // Reorder de tabs en el centro → persistir el orden de openFiles.
      if (event.type === 'reorder' && event.stripId === 'center') {
        syncEditorFileOrderFromCenter()
      }
    })
    return () => {
      unsubBus()
      unsubTabs()
    }
  }, [])

  return null
}
